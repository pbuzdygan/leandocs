import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';

afterEach(() => vi.unstubAllGlobals());

const content =
  'See [the manual](ATLAS.assets/manual.pdf).\n\n![Rack diagram](ATLAS.assets/rack.png)\n';

function api() {
  return mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === '/documents/id-atlas')
      return { body: documentDto('id-atlas', 'Infrastructure/Servers/ATLAS.md', { content }) };
    if (request.path === '/documents/id-atlas/attachments') return { body: { items: [] } };
    // Any request for the files themselves: they were deleted on disk.
    return undefined;
  });
}

describe('attachments missing on disk', () => {
  it('a link checks the file first and stays in the app with a message', async () => {
    const requests = api();
    const { user, location } = renderApp('/doc/id-atlas');
    const link = await screen.findByRole('link', { name: 'the manual' });
    expect(link).toHaveAttribute('href', '/api/v1/documents/id-atlas/attachments/manual.pdf');
    await user.click(link);
    expect(
      (await screen.findAllByText(/"manual.pdf" is no longer attached to this document/)).length,
    ).toBeGreaterThan(0);
    expect(requests.at(-1)).toMatchObject({
      method: 'HEAD',
      path: '/documents/id-atlas/attachments/manual.pdf',
    });
    expect(location()).toBe('/doc/id-atlas');
  });

  it('an image that cannot load says it is missing', async () => {
    api();
    renderApp('/doc/id-atlas');
    const image = await screen.findByRole('img', { name: 'Rack diagram' });
    fireEvent.error(image);
    expect(await screen.findByText('Image not found: Rack diagram')).toHaveAttribute(
      'title',
      'Image not found',
    );
  });
});
