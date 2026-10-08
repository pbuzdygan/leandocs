import { expect, test } from '@playwright/test';

/**
 * Creates the account on the visual-test server and signs in once (P16-06). Signing in for every
 * screenshot would hit the login rate limit; the visual project reuses this session.
 */
const VISUAL_AUTH_STATE = 'test-results/visual-auth-state.json';
const USER = { username: 'visual', password: 'a long visual test passphrase' };

test('sign in to the visual-test server', async ({ request }) => {
  const setup = (await (await request.get('/api/v1/auth/setup')).json()) as {
    required: boolean;
    setupToken?: string;
  };
  if (setup.required) {
    const created = await request.post('/api/v1/auth/setup', {
      headers: { 'X-LeanDocs-Setup-Token': setup.setupToken! },
      data: { ...USER, confirmPassword: USER.password },
    });
    expect(created.ok(), await created.text()).toBe(true);
  }
  const session = await request.get('/api/v1/auth/session');
  const { csrfToken } = (await session.json()) as { csrfToken: string };
  const login = await request.post('/api/v1/auth/login', {
    headers: { 'X-LeanDocs-CSRF': csrfToken },
    data: USER,
  });
  expect(login.status(), await login.text()).toBe(200);
  await request.storageState({ path: VISUAL_AUTH_STATE });
});
