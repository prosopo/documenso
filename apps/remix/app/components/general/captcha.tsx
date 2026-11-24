import { env } from '@documenso/lib/utils/env';
import type { TurnstileInstance } from '@marsidev/react-turnstile';

import { Turnstile } from '@marsidev/react-turnstile';
import type { Ref } from 'react';
import { useEffect, useImperativeHandle, useRef } from 'react';
import { Theme, useTheme } from 'remix-themes';

import { useCspNonce } from '~/utils/nonce';

const DEFAULT_PROCAPTCHA_SCRIPT_URL = 'https://js.prosopo.io/js/procaptcha.bundle.js';
const PROCAPTCHA_SCRIPT_ID = 'procaptcha-script';

export type CaptchaInstance = {
  getResponsePromise: (timeout?: number) => Promise<string>;
  reset: () => void;
};

type ProcaptchaRenderOptions = {
  siteKey: string;
  theme?: 'light' | 'dark';
  nonce?: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'chalexpired-callback'?: () => void;
  'error-callback'?: (error: Error) => void;
};

type ProcaptchaApi = {
  render: (element: Element, options: ProcaptchaRenderOptions) => Promise<string | undefined>;
  reset: (widgetId?: string) => Promise<void>;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    procaptcha?: ProcaptchaApi;
  }
}

export type CaptchaProvider = 'procaptcha' | 'turnstile';

export const getCaptchaProvider = (): CaptchaProvider | null => {
  if (env('NEXT_PUBLIC_PROCAPTCHA_SITE_KEY')) {
    return 'procaptcha';
  }

  if (env('NEXT_PUBLIC_TURNSTILE_SITE_KEY')) {
    return 'turnstile';
  }

  return null;
};

let procaptchaScript: Promise<ProcaptchaApi> | undefined;

const loadProcaptcha = (): Promise<ProcaptchaApi> => {
  if (window.procaptcha) {
    return Promise.resolve(window.procaptcha);
  }

  procaptchaScript ??= new Promise<ProcaptchaApi>((resolve, reject) => {
    const script = document.createElement('script');

    script.id = PROCAPTCHA_SCRIPT_ID;
    script.src = env('NEXT_PUBLIC_PROCAPTCHA_SCRIPT_URL') || DEFAULT_PROCAPTCHA_SCRIPT_URL;
    script.type = 'module';
    script.async = true;

    script.onload = () => {
      if (window.procaptcha) {
        resolve(window.procaptcha);
      } else {
        reject(new Error('Procaptcha script loaded without exposing its API'));
      }
    };

    script.onerror = () => {
      script.remove();
      reject(new Error('Failed to load the Procaptcha script'));
    };

    document.head.appendChild(script);
  }).catch((err: unknown) => {
    procaptchaScript = undefined;
    throw err;
  });

  return procaptchaScript;
};

type ProcaptchaWidgetProps = {
  siteKey: string;
  ref?: Ref<CaptchaInstance>;
};

const ProcaptchaWidget = ({ siteKey, ref }: ProcaptchaWidgetProps) => {
  const [theme] = useTheme();
  const nonce = useCspNonce();

  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const tokenRef = useRef<string | undefined>(undefined);
  const waitersRef = useRef<Array<(token: string) => void>>([]);

  useImperativeHandle(ref, () => ({
    getResponsePromise: async (timeout = 30000) => {
      if (tokenRef.current) {
        return tokenRef.current;
      }

      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          waitersRef.current = waitersRef.current.filter((waiter) => waiter !== onToken);
          reject(new Error('Timed out waiting for a Procaptcha response'));
        }, timeout);

        const onToken = (token: string) => {
          clearTimeout(timer);
          resolve(token);
        };

        waitersRef.current.push(onToken);
      });
    },
    reset: () => {
      tokenRef.current = undefined;

      if (widgetIdRef.current) {
        void window.procaptcha?.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let isUnmounted = false;

    const clearToken = () => {
      tokenRef.current = undefined;
    };

    void loadProcaptcha()
      .then(async (procaptcha) => {
        if (isUnmounted) {
          return;
        }

        const widgetId = await procaptcha.render(container, {
          siteKey,
          nonce,
          theme: theme === Theme.DARK ? 'dark' : 'light',
          callback: (token) => {
            tokenRef.current = token;

            const waiters = waitersRef.current;
            waitersRef.current = [];
            for (const waiter of waiters) {
              waiter(token);
            }
          },
          'expired-callback': clearToken,
          'chalexpired-callback': clearToken,
          'error-callback': clearToken,
        });

        if (isUnmounted) {
          if (widgetId) {
            procaptcha.remove(widgetId);
          }

          return;
        }

        widgetIdRef.current = widgetId;
      })
      .catch((err: unknown) => {
        console.error(err);
      });

    return () => {
      isUnmounted = true;
      tokenRef.current = undefined;

      if (widgetIdRef.current) {
        window.procaptcha?.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }

      container.replaceChildren();
    };
  }, [siteKey, nonce, theme]);

  return <div ref={containerRef} className="min-h-[74px]" />;
};

type TurnstileWidgetProps = {
  siteKey: string;
  ref?: Ref<CaptchaInstance>;
};

const TurnstileWidget = ({ siteKey, ref }: TurnstileWidgetProps) => {
  const turnstileRef = useRef<TurnstileInstance>(null);

  useImperativeHandle(ref, () => ({
    getResponsePromise: async (timeout) => {
      if (!turnstileRef.current) {
        throw new Error('Turnstile is not ready');
      }

      return await turnstileRef.current.getResponsePromise(timeout);
    },
    reset: () => turnstileRef.current?.reset(),
  }));

  return (
    <Turnstile
      ref={turnstileRef}
      siteKey={siteKey}
      options={{
        size: 'flexible',
        appearance: 'always',
      }}
    />
  );
};

export type CaptchaProps = {
  ref?: Ref<CaptchaInstance>;
};

/**
 * Renders the configured captcha widget, or nothing when no captcha provider
 * is configured. Procaptcha takes precedence when both are configured.
 */
export const Captcha = ({ ref }: CaptchaProps) => {
  const procaptchaSiteKey = env('NEXT_PUBLIC_PROCAPTCHA_SITE_KEY');
  const turnstileSiteKey = env('NEXT_PUBLIC_TURNSTILE_SITE_KEY');

  if (procaptchaSiteKey) {
    return <ProcaptchaWidget ref={ref} siteKey={procaptchaSiteKey} />;
  }

  if (turnstileSiteKey) {
    return <TurnstileWidget ref={ref} siteKey={turnstileSiteKey} />;
  }

  return null;
};
