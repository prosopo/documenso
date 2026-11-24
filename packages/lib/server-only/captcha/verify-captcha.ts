import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';

import { logger } from '../../utils/logger';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_PROCAPTCHA_VERIFY_URL = 'https://api.prosopo.io/siteverify';
const VERIFY_TIMEOUT_MS = 10_000;

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes': string[];
  challenge_ts?: string;
  hostname?: string;
};

type ProcaptchaVerifyResponse = {
  verified: boolean;
  reason?: string;
};

type CaptchaVerifyResult = {
  success: boolean;
  errorCodes: string[];
  hostname?: string;
};

type CaptchaVerifier = {
  provider: 'procaptcha' | 'turnstile';
  request: (token: string, ipAddress?: string | null) => Promise<Response>;
  parse: (response: Response) => Promise<CaptchaVerifyResult>;
};

const createProcaptchaVerifier = (secretKey: string, verifyUrl: string): CaptchaVerifier => ({
  provider: 'procaptcha',
  request: async (token, ipAddress) =>
    await fetch(verifyUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secretKey,
        token,
        ...(ipAddress ? { ip: ipAddress } : {}),
      }),
    }),
  parse: async (response) => {
    const result: ProcaptchaVerifyResponse = await response.json();

    return {
      success: result.verified === true,
      errorCodes: result.reason ? [result.reason] : [],
    };
  },
});

const createTurnstileVerifier = (secretKey: string): CaptchaVerifier => ({
  provider: 'turnstile',
  request: async (token, ipAddress) => {
    const formData = new URLSearchParams();

    formData.append('secret', secretKey);
    formData.append('response', token);

    if (ipAddress) {
      formData.append('remoteip', ipAddress);
    }

    return await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
  },
  parse: async (response) => {
    const result: TurnstileVerifyResponse = await response.json();

    return {
      success: result.success,
      errorCodes: result['error-codes'] ?? [],
      hostname: result.hostname,
    };
  },
});

const getCaptchaVerifier = (): CaptchaVerifier | null => {
  const procaptchaSecretKey = process.env.NEXT_PRIVATE_PROCAPTCHA_SECRET_KEY;

  if (procaptchaSecretKey) {
    return createProcaptchaVerifier(
      procaptchaSecretKey,
      process.env.NEXT_PRIVATE_PROCAPTCHA_VERIFY_URL || DEFAULT_PROCAPTCHA_VERIFY_URL,
    );
  }

  const turnstileSecretKey = process.env.NEXT_PRIVATE_TURNSTILE_SECRET_KEY;

  if (turnstileSecretKey) {
    return createTurnstileVerifier(turnstileSecretKey);
  }

  return null;
};

/**
 * Verify a captcha token server-side.
 *
 * Supports Prosopo Procaptcha and Cloudflare Turnstile. This is a no-op if
 * neither `NEXT_PRIVATE_PROCAPTCHA_SECRET_KEY` nor
 * `NEXT_PRIVATE_TURNSTILE_SECRET_KEY` is configured, making captcha
 * verification an opt-in feature. Procaptcha takes precedence when both are
 * configured, matching the widget rendered on the client.
 */
export const verifyCaptchaToken = async ({
  token,
  ipAddress,
}: {
  token?: string | null;
  ipAddress?: string | null;
}) => {
  const verifier = getCaptchaVerifier();

  // If no secret key is configured, skip verification.
  if (!verifier) {
    return;
  }

  const { provider } = verifier;

  if (!token) {
    logger.warn({
      msg: 'Captcha verification rejected: missing token',
      provider,
      ipAddress,
    });

    throw new AppError(AppErrorCode.INVALID_CAPTCHA, {
      message: 'Captcha token is required',
      statusCode: 400,
    });
  }

  let response: Response;

  try {
    response = await verifier.request(token, ipAddress);
  } catch (err) {
    logger.error({
      msg: 'Captcha verification failed: network error calling siteverify',
      provider,
      err,
      ipAddress,
    });

    throw new AppError(AppErrorCode.INVALID_CAPTCHA, {
      message: 'Captcha verification failed',
      statusCode: 400,
    });
  }

  if (!response.ok) {
    logger.error({
      msg: 'Captcha verification failed: non-2xx response from siteverify',
      provider,
      status: response.status,
      ipAddress,
    });

    throw new AppError(AppErrorCode.INVALID_CAPTCHA, {
      message: `Captcha verification request failed with status ${response.status}`,
      statusCode: 400,
    });
  }

  const result = await verifier.parse(response);

  if (!result.success) {
    logger.warn({
      msg: 'Captcha verification rejected by provider',
      provider,
      errorCodes: result.errorCodes,
      hostname: result.hostname,
      ipAddress,
    });

    throw new AppError(AppErrorCode.INVALID_CAPTCHA, {
      message: `Captcha verification failed: ${result.errorCodes.join(', ') || 'unknown'}`,
      statusCode: 400,
    });
  }
};
