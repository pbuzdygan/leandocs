import { screen } from '@testing-library/react';
import { APP_VERSION } from '@leandocs/shared';
import { describe, expect, it } from 'vitest';
import { folder, mockApi, renderApp } from '../test/render';

const routes = (version: string) => ({
  'GET /tree': { root: folder('') },
  'GET /health': { status: 'ok', name: 'LeanDocs', version },
});

describe('about settings', () => {
  it('shows the server and frontend versions', async () => {
    mockApi(routes(APP_VERSION));
    renderApp('/settings/about');
    expect(await screen.findByRole('heading', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByText('Documentation without the bloat.')).toBeInTheDocument();
    const server = await screen.findByText('Server version');
    expect(server.nextElementSibling).toHaveTextContent(APP_VERSION);
    expect(screen.getByText('Frontend version').nextElementSibling).toHaveTextContent(APP_VERSION);
    expect(screen.queryByRole('button', { name: 'Reload page' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/pbuzdygan/leandocs',
    );
  });

  it('asks for a reload when the page is older than the server', async () => {
    mockApi(routes('99.0.0'));
    renderApp('/settings/about');
    expect(await screen.findByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('The server runs version 99.0.0');
  });
});
