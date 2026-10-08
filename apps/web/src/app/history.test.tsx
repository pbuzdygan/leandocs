import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';
import { nextPosition } from './history';

/** P16-05: Back / Forward in the topbar (UI_SPEC §94). */

describe('nextPosition', () => {
  const start = nextPosition(undefined, 'a', 'POP');

  it('adds pushed pages and drops the forward entries', () => {
    const atC = nextPosition(nextPosition(start, 'b', 'PUSH'), 'c', 'PUSH');
    expect(atC).toEqual({ keys: ['a', 'b', 'c'], index: 2 });
    const backToA = nextPosition(atC, 'a', 'POP');
    expect(backToA).toEqual({ keys: ['a', 'b', 'c'], index: 0 });
    expect(nextPosition(backToA, 'd', 'PUSH')).toEqual({ keys: ['a', 'd'], index: 1 });
  });

  it('replaces the current entry and ignores repeated keys', () => {
    const atB = nextPosition(start, 'b', 'PUSH');
    expect(nextPosition(atB, 'x', 'REPLACE')).toEqual({ keys: ['a', 'x'], index: 1 });
    expect(nextPosition(atB, 'b', 'PUSH')).toBe(atB);
  });

  it('starts again at a page it has never seen', () => {
    expect(nextPosition(start, 'unknown', 'POP')).toEqual({ keys: ['unknown'], index: 0 });
  });

  it('keeps at most 200 entries', () => {
    let position = start;
    for (let i = 0; i < 250; i++) position = nextPosition(position, `k${i}`, 'PUSH');
    expect(position.keys).toHaveLength(200);
    expect(position.index).toBe(199);
  });
});

describe('Back and Forward', () => {
  function api() {
    mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
      if (request.path === '/pins') return { body: { items: [] } };
      if (request.path === '/documents/id-vlan')
        return { body: documentDto('id-vlan', 'Network/VLAN.md') };
      if (request.path === '/documents/id-readme')
        return { body: documentDto('id-readme', 'README.md') };
      return undefined;
    });
  }

  it('move through the pages visited and are disabled at the ends', async () => {
    api();
    const { user, location } = renderApp('/');
    const back = await screen.findByRole('button', { name: 'Back' });
    const forward = screen.getByRole('button', { name: 'Forward' });
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();

    await user.click(await screen.findByRole('treeitem', { name: 'Read me' }));
    await waitFor(() => expect(location()).toBe('/doc/id-readme'));
    expect(back).toBeEnabled();
    expect(forward).toBeDisabled();

    await user.click(back);
    await waitFor(() => expect(location()).toBe('/'));
    expect(back).toBeDisabled();
    expect(forward).toBeEnabled();

    await user.click(forward);
    await waitFor(() => expect(location()).toBe('/doc/id-readme'));
    expect(forward).toBeDisabled();

    // A new page after going back drops the pages ahead, as in a browser.
    await user.click(back);
    await waitFor(() => expect(location()).toBe('/'));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(location()).toBe('/settings/general'));
    expect(forward).toBeDisabled();
    await user.click(back);
    await waitFor(() => expect(location()).toBe('/'));
  });
});
