import { useEffect, useRef, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger offset in seconds for sequential reveals (becomes transition-delay). */
  delay?: number;
}

/**
 * The single scroll-reveal primitive for the landing page. Fades + lifts content into view
 * once, when ~20% visible, then stops.
 *
 * Implemented with ONE shared, module-level IntersectionObserver for every <Reveal> on the
 * page. Previously this used Framer Motion's `whileInView`, which spins up an observer *per*
 * element (~20 on the landing) and pulls in the animation engine — that overhead was a prime
 * suspect for the mobile/WebKit "a problem repeatedly occurred" crash. The reveal itself is
 * pure CSS (`.reveal` → `.reveal-in` in index.css), and `prefers-reduced-motion` is honored
 * there, so the page is fully usable (and instantly visible) without animation.
 */
let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          callbacks.get(entry.target)?.();
          sharedObserver!.unobserve(entry.target);
          callbacks.delete(entry.target);
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );
  }
  return sharedObserver;
}

export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = getObserver();
    if (!observer) {
      el.classList.add("reveal-in"); // no IntersectionObserver support → reveal immediately
      return;
    }
    callbacks.set(el, () => el.classList.add("reveal-in"));
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      callbacks.delete(el);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `reveal ${className}` : "reveal"}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
