import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// Extend Window interface to include grecaptcha
declare global {
  interface Window {
    grecaptcha: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        'expired-callback'?: () => void;
        'error-callback'?: () => void;
      }) => number;
      reset: (widgetId?: number) => void;
      getResponse: (widgetId?: number) => string;
    };
  }
}

export interface ReCaptchaHandle {
  getToken: () => string;
  getTokenWithAge: () => { token: string; issuedAt: number } | null;
  reset: () => void;
}

interface ReCaptchaProps {
  onVerify?: (token: string) => void;
  onExpired?: () => void;
  onError?: () => void;
}

const ReCaptcha = forwardRef<ReCaptchaHandle, ReCaptchaProps>(
  ({ onVerify, onExpired, onError }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<number | null>(null);
    const tokenDataRef = useRef<{ token: string; issuedAt: number } | null>(null);
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

    useEffect(() => {
      if (!siteKey) {
        console.warn(
          '[ReCaptcha] VITE_RECAPTCHA_SITE_KEY is not set — the CAPTCHA widget will not render.'
        );
      }

      // Inject Google's reCAPTCHA script once if it isn't already on the page.
      const SCRIPT_ID = 'google-recaptcha-script';
      if (typeof document !== 'undefined' && !document.getElementById(SCRIPT_ID)) {
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = 'https://www.google.com/recaptcha/api.js';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      // Wait for grecaptcha to be available (it appears once the script above loads).
      const checkGrecaptcha = setInterval(() => {
        if (window.grecaptcha && containerRef.current && widgetIdRef.current === null) {
          clearInterval(checkGrecaptcha);
          
          try {
            widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
              sitekey: siteKey,
              callback: (token: string) => {
                tokenDataRef.current = {
                  token,
                  issuedAt: Date.now()
                };
                if (onVerify) onVerify(token);
              },
              'expired-callback': () => {
                tokenDataRef.current = null;
                if (onExpired) onExpired();
              },
              'error-callback': () => {
                tokenDataRef.current = null;
                if (onError) onError();
              },
            });
          } catch (error) {
            console.error('Error rendering reCAPTCHA:', error);
          }
        }
      }, 100);

      return () => {
        clearInterval(checkGrecaptcha);
      };
    }, [siteKey, onVerify, onExpired, onError]);

    useImperativeHandle(ref, () => ({
      getToken: () => {
        if (window.grecaptcha && widgetIdRef.current !== null) {
          return window.grecaptcha.getResponse(widgetIdRef.current);
        }
        return '';
      },
      getTokenWithAge: () => {
        return tokenDataRef.current;
      },
      reset: () => {
        if (window.grecaptcha && widgetIdRef.current !== null) {
          window.grecaptcha.reset(widgetIdRef.current);
          tokenDataRef.current = null;
        }
      },
    }));

    return (
      <div className="flex justify-center my-4">
        <div ref={containerRef} />
      </div>
    );
  }
);

ReCaptcha.displayName = 'ReCaptcha';

export default ReCaptcha;
