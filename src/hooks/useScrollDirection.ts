import { useState, useEffect, useRef } from 'react';

type ScrollDirection = 'up' | 'down';

const THRESHOLD = 10;

export function useScrollDirection(elementId = 'main-content'): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>('up');
  const prevScrollTop = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const el = document.getElementById(elementId);
    if (!el) return;

    prevScrollTop.current = el.scrollTop;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentScrollTop = el.scrollTop;
        const diff = currentScrollTop - prevScrollTop.current;

        if (diff > THRESHOLD) {
          setDirection('down');
        } else if (diff < -THRESHOLD) {
          setDirection('up');
        }

        prevScrollTop.current = currentScrollTop;
        ticking.current = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [elementId]);

  return direction;
}
