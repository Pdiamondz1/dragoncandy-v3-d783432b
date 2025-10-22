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
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

    useEffect(() => {
      // Wait for grecaptcha to be available
      const checkGrecaptcha = setInterval(() => {
        if (window.grecaptcha && containerRef.current && widgetIdRef.current === null) {
          clearInterval(checkGrecaptcha);
          
          try {
            widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
              sitekey: siteKey,
              callback: (token: string) => {
                if (onVerify) onVerify(token);
              },
              'expired-callback': () => {
                if (onExpired) onExpired();
              },
              'error-callback': () => {
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
      reset: () => {
        if (window.grecaptcha && widgetIdRef.current !== null) {
          window.grecaptcha.reset(widgetIdRef.current);
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
