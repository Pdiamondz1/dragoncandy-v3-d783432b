import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@/lib/tours/role-tours";

interface DCTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

const POPOVER_WIDTH = 288;
const GAP = 12;
const EDGE_MARGIN = 16;

export function DCTour({ steps, onComplete, onSkip }: DCTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const updateTargetRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [updateTargetRect]);

  useLayoutEffect(() => {
    if (popoverRef.current) {
      setPopoverHeight(popoverRef.current.offsetHeight);
    }
  }, [currentStep]);

  const next = () => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const back = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  if (!step) return null;

  const padding = 8;

  let showAbove = false;
  let finalTop: number;
  let finalLeft: number;

  if (targetRect) {
    const targetCenterX = targetRect.left + targetRect.width / 2;
    finalLeft = Math.min(
      Math.max(targetCenterX - POPOVER_WIDTH / 2, EDGE_MARGIN),
      window.innerWidth - POPOVER_WIDTH - EDGE_MARGIN
    );

    const spaceBelow = window.innerHeight - targetRect.bottom - GAP;
    const spaceAbove = targetRect.top - GAP;
    const h = popoverHeight || 180;

    showAbove = spaceBelow < h && spaceAbove > spaceBelow;
    finalTop = showAbove
      ? targetRect.top - h - GAP
      : targetRect.bottom + GAP;
  } else {
    finalTop = window.innerHeight / 2;
    finalLeft = EDGE_MARGIN;
  }

  const arrowLeft = targetRect
    ? Math.min(
        Math.max(targetRect.left + targetRect.width / 2 - finalLeft - 6, 12),
        POPOVER_WIDTH - 24
      )
    : POPOVER_WIDTH / 2 - 6;

  return (
    <div className="fixed inset-0 z-[80]" aria-modal="true" role="dialog">
      {/* Dimmed overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.4)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Click-through on highlighted area */}
      {targetRect && (
        <div
          className="absolute z-[81]"
          style={{
            left: targetRect.left - padding,
            top: targetRect.top - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
          }}
        />
      )}

      {/* Outside-click dismiss */}
      <div
        className="absolute inset-0 z-[81]"
        onClick={onSkip}
        style={{
          clipPath: targetRect
            ? `polygon(
                0 0, 100% 0, 100% 100%, 0 100%,
                0 ${targetRect.top - padding}px,
                ${targetRect.left - padding}px ${targetRect.top - padding}px,
                ${targetRect.left - padding}px ${targetRect.bottom + padding}px,
                0 ${targetRect.bottom + padding}px
              )`
            : undefined,
        }}
      />

      {/* Popover */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          ref={popoverRef}
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: showAbove ? -8 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: showAbove ? 8 : -8 }}
          transition={{ duration: 0.15 }}
          className="absolute z-[82] w-72 bg-white rounded-xl shadow-2xl border border-gray-100 p-4"
          style={{ top: finalTop, left: finalLeft }}
        >
          {/* Arrow pointing toward target */}
          <div
            className="absolute w-3 h-3 bg-white border-gray-100 rotate-45"
            style={showAbove
              ? { bottom: -6, left: arrowLeft, borderRight: '1px solid', borderBottom: '1px solid' }
              : { top: -6, left: arrowLeft, borderLeft: '1px solid', borderTop: '1px solid' }
            }
          />

          <div className="space-y-2">
            <p className="text-sm font-semibold text-dc-dark">{step.title}</p>
            <p className="text-xs text-gray-600 leading-relaxed">{step.body}</p>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={onSkip}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={back}
                  className="text-xs h-7 px-2"
                >
                  Back
                </Button>
              )}
              <Button
                variant="dc-primary"
                size="sm"
                onClick={next}
                className="text-xs h-7 px-3"
              >
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex justify-center gap-1 mt-3">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i === currentStep ? "bg-dc-teal" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
