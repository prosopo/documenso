import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { verifyCaptchaToken } from './verify-captcha';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const expectInvalidCaptcha = async (promise: Promise<void>) => {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code: AppErrorCode.INVALID_CAPTCHA });
};

describe('verifyCaptchaToken', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PRIVATE_PROCAPTCHA_SECRET_KEY', '');
    vi.stubEnv('NEXT_PRIVATE_TURNSTILE_SECRET_KEY', '');
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('skips verification when no secret key is configured', async () => {
    await verifyCaptchaToken({ token: 'token' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('procaptcha', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PRIVATE_PROCAPTCHA_SECRET_KEY', 'procaptcha-secret');
    });

    it('posts the token, secret and ip to the Procaptcha siteverify endpoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', verified: true }));

      await verifyCaptchaToken({ token: 'token', ipAddress: '203.0.113.7' });

      expect(fetchMock).toHaveBeenCalledOnce();

      const [url, init] = fetchMock.mock.calls[0];

      expect(url).toBe('https://api.prosopo.io/siteverify');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(String(init?.body))).toEqual({
        secret: 'procaptcha-secret',
        token: 'token',
        ip: '203.0.113.7',
      });
    });

    it('rejects a token Procaptcha did not verify', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ status: 'ok', verified: false, reason: 'CAPTCHA.DAPP_USER_SOLUTION_NOT_FOUND' }),
      );

      await expectInvalidCaptcha(verifyCaptchaToken({ token: 'token' }));
    });

    it('rejects when siteverify returns an error status', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'SITE_KEY_INVALID' } }, 400));

      await expectInvalidCaptcha(verifyCaptchaToken({ token: 'token' }));
    });

    it('rejects a missing token without calling siteverify', async () => {
      await expectInvalidCaptcha(verifyCaptchaToken({ token: undefined }));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('takes precedence over Turnstile when both are configured', async () => {
      vi.stubEnv('NEXT_PRIVATE_TURNSTILE_SECRET_KEY', 'turnstile-secret');
      fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', verified: true }));

      await verifyCaptchaToken({ token: 'token' });

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.prosopo.io/siteverify');
    });
  });

  describe('turnstile', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PRIVATE_TURNSTILE_SECRET_KEY', 'turnstile-secret');
    });

    it('posts a form-encoded request to the Turnstile siteverify endpoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ success: true, 'error-codes': [] }));

      await verifyCaptchaToken({ token: 'token', ipAddress: '203.0.113.7' });

      const [url, init] = fetchMock.mock.calls[0];

      expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
      expect(String(init?.body)).toBe('secret=turnstile-secret&response=token&remoteip=203.0.113.7');
    });

    it('rejects a token Turnstile did not verify', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] }));

      await expectInvalidCaptcha(verifyCaptchaToken({ token: 'token' }));
    });
  });
});
