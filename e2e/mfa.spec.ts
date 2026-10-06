import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

/** Independent RFC 6238 fixture; production verification uses OTPAuth. */
function authenticatorCode(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[19]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('enrolls an authenticator, requires MFA, recovers access and reauthenticates disablement', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(150_000);
  const password = 'a long MFA browser passphrase';
  const setup = await (await request.get('/api/v1/auth/setup')).json();
  expect(
    (
      await request.post('/api/v1/auth/setup', {
        headers: { 'X-LeanDocs-Setup-Token': setup.setupToken },
        data: { username: 'owner', password, confirmPassword: password },
      })
    ).status(),
  ).toBe(201);
  const login = async () => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('owner');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  };
  await login();
  await expect(page.getByText('No documentation yet')).toBeVisible();
  await page.goto('/settings/security');
  await page.getByLabel('Current password').fill(password);
  await page.getByRole('button', { name: 'Set up two-factor authentication' }).click();
  const key = await page.getByLabel('Manual setup key').textContent();
  expect(key).toMatch(/^[A-Z2-7]{32}$/);
  await expect(page.getByRole('img', { name: 'Authenticator enrollment QR code' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill(authenticatorCode(key!));
  await page.getByRole('button', { name: 'Confirm and enable' }).click();
  const codes = (await page.getByLabel('Recovery codes').textContent())!.trim().split('\n');
  expect(codes).toHaveLength(10);
  await page.getByRole('button', { name: 'I have saved my recovery codes' }).click();
  await expect(page.getByText('Enabled. 10 recovery codes remaining.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mfa-enabled.png') });
  const logout = async () => {
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  };
  await logout();
  await login();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  expect((await page.request.get('/api/v1/tree')).status()).toBe(401);
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await page.getByLabel('Recovery code').fill(codes[0]!);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByText('No documentation yet')).toBeVisible();
  await page.goto('/settings/security');
  await expect(page.getByText('Enabled. 9 recovery codes remaining.')).toBeVisible();
  await logout();
  // Five admitted attempts are shared by password, enrollment and factor verification.
  // Wait for the real production limiter and a new OTP time step; no test-only bypass.
  await page.waitForTimeout(31_000);
  await page.waitForTimeout(30_000);
  await login();
  await page.getByLabel('Authenticator code').fill(authenticatorCode(key!));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByText('No documentation yet')).toBeVisible();
  await page.goto('/settings/security');
  await page.getByLabel('Current password').fill(password);
  await page.getByLabel('Authenticator or recovery code').fill(codes[1]!);
  await page.getByRole('button', { name: 'Disable two-factor authentication' }).click();
  await expect(page.getByText('Not enabled.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Not enabled.')).toBeVisible();
});
