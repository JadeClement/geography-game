"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import {
  gameTutorialActions,
  gameTutorialBackdrop,
  gameTutorialCard,
  gameTutorialCardBody,
  gameTutorialCardTitle,
  gameTutorialFooter,
  gameTutorialHelpBadge,
  gameTutorialNavBtn,
  gameTutorialNavBtnPrimary,
  gameTutorialOverlay,
  gameTutorialOverlaySpotlight,
  gameTutorialOverlaySpotlightInteractive,
  gameTutorialProgress,
  gameTutorialSkip,
  gameTutorialSpotlight,
  gameTutorialSpotlightRing,
  gameTutorialTooltip,
  gameTutorialTooltipArrow,
  gameTutorialTooltipMobileSheet,
} from "@/lib/ui";

const TOOLTIP_GAP = 14;
const VIEWPORT_PADDING = 16;
const TOOLTIP_ESTIMATED_HEIGHT = 220;
const TOOLTIP_ESTIMATED_WIDTH = 320;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function renderBody(body) {
  if (typeof body !== "string" || !body.includes("{{help}}")) {
    return body;
  }
  return body.split("{{help}}").flatMap((segment, index) =>
    index === 0
      ? [segment]
      : [
          <span key={`help-${index}`} className={gameTutorialHelpBadge} aria-label="help">
            ?
          </span>,
          segment,
        ]
  );
}

function resolveTarget(target) {
  if (!target) return null;
  if (typeof target === "object" && "current" in target) {
    return target.current;
  }
  return target;
}

function getTargetRect(targetEl) {
  if (!targetEl) return null;
  const rect = targetEl.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return rect;
}

function choosePlacement(preferred, rect, tooltipHeight) {
  if (!rect || typeof window === "undefined") return preferred;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const height = tooltipHeight ?? TOOLTIP_ESTIMATED_HEIGHT;

  if (preferred === "bottom") {
    const overflow = rect.bottom + TOOLTIP_GAP + height;
    if (overflow > viewportHeight - VIEWPORT_PADDING) return "top";
    return preferred;
  }

  if (preferred === "top") {
    const overflow = rect.top - TOOLTIP_GAP - height;
    if (overflow < VIEWPORT_PADDING) return "bottom";
    return preferred;
  }

  if (preferred === "left") {
    const overflow = rect.left - TOOLTIP_GAP - TOOLTIP_ESTIMATED_WIDTH;
    if (overflow < VIEWPORT_PADDING) return "right";
    return preferred;
  }

  if (preferred === "right") {
    const overflow = rect.right + TOOLTIP_GAP + TOOLTIP_ESTIMATED_WIDTH;
    if (overflow > viewportWidth - VIEWPORT_PADDING) return "left";
    return preferred;
  }

  return preferred;
}

function getTooltipDockedStyle() {
  return {
    left: VIEWPORT_PADDING,
    right: VIEWPORT_PADDING,
    bottom: `max(${VIEWPORT_PADDING}px, env(safe-area-inset-bottom, 0px))`,
    top: "auto",
    transform: "none",
    maxWidth: "none",
  };
}

function getTooltipBounds(style, placement, width, height) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (style.top === "auto" && style.bottom != null) {
    const bottomPx =
      typeof style.bottom === "number"
        ? style.bottom
        : VIEWPORT_PADDING;
    return {
      top: viewportHeight - bottomPx - height,
      bottom: viewportHeight - bottomPx,
      left: VIEWPORT_PADDING,
      right: viewportWidth - VIEWPORT_PADDING,
    };
  }

  const top = style.top ?? 0;
  const left = style.left ?? 0;
  const transform = style.transform ?? "";

  let boxTop = top;
  let boxLeft = left;

  if (transform.includes("-100%")) {
    if (transform.includes("-50%")) {
      boxTop = top - height;
      boxLeft = left - width / 2;
    } else {
      boxTop = top - height;
    }
  } else if (transform.includes("-50%")) {
    boxLeft = left - width / 2;
    if (transform.includes("translateY")) {
      boxTop = top - height / 2;
    }
  } else if (transform.includes("translateX(-50%)")) {
    boxLeft = left - width / 2;
  }

  return {
    top: boxTop,
    left: boxLeft,
    bottom: boxTop + height,
    right: boxLeft + width,
  };
}

function tooltipFitsViewport(style, placement, width, height) {
  if (typeof window === "undefined") return true;
  const bounds = getTooltipBounds(style, placement, width, height);
  return (
    bounds.top >= VIEWPORT_PADDING &&
    bounds.left >= VIEWPORT_PADDING &&
    bounds.bottom <= window.innerHeight - VIEWPORT_PADDING &&
    bounds.right <= window.innerWidth - VIEWPORT_PADDING
  );
}

function computeTooltipStyle(placement, rect, width, height) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maxWidth = "min(22rem, calc(100vw - 2rem))";

  if (placement === "bottom") {
    return {
      top: clamp(
        rect.bottom + TOOLTIP_GAP,
        VIEWPORT_PADDING,
        window.innerHeight - height - VIEWPORT_PADDING
      ),
      left: clamp(
        centerX,
        VIEWPORT_PADDING + width / 2,
        window.innerWidth - VIEWPORT_PADDING - width / 2
      ),
      transform: "translateX(-50%)",
      maxWidth,
    };
  }

  if (placement === "top") {
    return {
      top: clamp(
        rect.top - TOOLTIP_GAP,
        VIEWPORT_PADDING + height,
        window.innerHeight - VIEWPORT_PADDING
      ),
      left: clamp(
        centerX,
        VIEWPORT_PADDING + width / 2,
        window.innerWidth - VIEWPORT_PADDING - width / 2
      ),
      transform: "translate(-50%, -100%)",
      maxWidth,
    };
  }

  if (placement === "left") {
    return {
      top: clamp(
        centerY,
        VIEWPORT_PADDING + height / 2,
        window.innerHeight - VIEWPORT_PADDING - height / 2
      ),
      left: clamp(
        rect.left - TOOLTIP_GAP,
        VIEWPORT_PADDING + width,
        window.innerWidth - VIEWPORT_PADDING
      ),
      transform: "translate(-100%, -50%)",
      maxWidth: "min(18rem, calc(100vw - 2rem))",
    };
  }

  return {
    top: clamp(
      centerY,
      VIEWPORT_PADDING + height / 2,
      window.innerHeight - VIEWPORT_PADDING - height / 2
    ),
    left: clamp(
      rect.right + TOOLTIP_GAP,
      VIEWPORT_PADDING,
      window.innerWidth - width - VIEWPORT_PADDING
    ),
    transform: "translateY(-50%)",
    maxWidth: "min(18rem, calc(100vw - 2rem))",
  };
}

function getTooltipStyle(placement, rect, tooltipSize = {}) {
  if (!rect || typeof window === "undefined") {
    return getTooltipDockedStyle();
  }

  const width = tooltipSize.width ?? TOOLTIP_ESTIMATED_WIDTH;
  const height = tooltipSize.height ?? TOOLTIP_ESTIMATED_HEIGHT;
  const resolvedPlacement = choosePlacement(placement, rect, height);
  const style = computeTooltipStyle(resolvedPlacement, rect, width, height);

  if (tooltipFitsViewport(style, resolvedPlacement, width, height)) {
    return style;
  }

  const alternatePlacement = resolvedPlacement === "top" ? "bottom" : "top";
  const alternateStyle = computeTooltipStyle(alternatePlacement, rect, width, height);
  if (tooltipFitsViewport(alternateStyle, alternatePlacement, width, height)) {
    return alternateStyle;
  }

  return getTooltipDockedStyle();
}

function getSpotlightPlacement(target, rect, isMobile) {
  if (!rect) return "bottom";
  if (target === "map") return isMobile ? "top" : "top";
  if (target === "score") return "left";
  if (target === "controls" || target === "pacificControls") return "bottom";
  return "bottom";
}

export default function GameTutorial({
  open,
  steps,
  targets,
  isMobile = false,
  onClose,
  onComplete,
  onStepChange,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipSize, setTooltipSize] = useState(null);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef(null);

  const step = steps[stepIndex] ?? null;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex >= steps.length - 1;
  const shouldTrapFocus =
    open && mounted && step != null && (step.type === "modal" || !step.interactive);
  const dialogRef = useFocusTrap(shouldTrapFocus);

  useEffect(() => {
    setMounted(true);
  }, []);

  const measureTarget = useCallback(() => {
    if (!open || !step || step.type !== "spotlight" || !step.target) {
      setTargetRect(null);
      return;
    }

    const el = resolveTarget(targets?.[step.target] ?? null);
    setTargetRect(getTargetRect(el));
  }, [open, step, targets]);

  useEffect(() => {
    if (!open) {
      onStepChange?.(null);
      return;
    }
    onStepChange?.(step);
  }, [open, onStepChange, step]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setTargetRect(null);
      setTooltipSize(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    measureTarget();
  }, [measureTarget, stepIndex]);

  useLayoutEffect(() => {
    if (!open || !step || step.type !== "spotlight" || isMobile) {
      setTooltipSize(null);
      return;
    }

    const el = tooltipRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setTooltipSize({ width: rect.width, height: rect.height });
    }
  }, [open, step, stepIndex, targetRect, isMobile]);

  useEffect(() => {
    if (!open) return undefined;

    const handleLayout = () => measureTarget();
    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);
    return () => {
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
    };
  }, [open, measureTarget]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.({ completed: false, skipped: true });
        return;
      }
      if (event.key === "ArrowRight" && !isLast) {
        event.preventDefault();
        setStepIndex((index) => Math.min(index + 1, steps.length - 1));
      }
      if (event.key === "ArrowLeft" && !isFirst) {
        event.preventDefault();
        setStepIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter") {
        const el = event.target;
        const tag = el?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) {
          return;
        }
        event.preventDefault();
        if (isLast) {
          onComplete?.();
          onClose?.({ completed: true, skipped: false });
        } else {
          setStepIndex((index) => Math.min(index + 1, steps.length - 1));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isFirst, isLast, onClose, onComplete, steps.length]);

  if (!open || !step || !mounted) return null;

  const handleFinish = ({ skipped = false } = {}) => {
    if (skipped) {
      onClose?.({ completed: false, skipped: true });
      return;
    }
    if (isLast) {
      onComplete?.();
      onClose?.({ completed: true, skipped: false });
      return;
    }
    setStepIndex((index) => index + 1);
  };

  const footer = (
    <div className={gameTutorialFooter}>
      <button
        type="button"
        className={gameTutorialSkip}
        onClick={() => handleFinish({ skipped: true })}
      >
        Skip tour
      </button>
      <span className={gameTutorialProgress}>
        {stepIndex + 1} / {steps.length}
      </span>
      <div className={gameTutorialActions}>
        <button
          type="button"
          className={gameTutorialNavBtn}
          disabled={isFirst}
          onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
          aria-label="Previous step"
        >
          ←
        </button>
        <button
          type="button"
          className={cn(gameTutorialNavBtn, gameTutorialNavBtnPrimary)}
          onClick={() => handleFinish()}
          aria-label={isLast ? "Start playing" : "Next step"}
        >
          {isLast ? "Start" : "→"}
        </button>
      </div>
    </div>
  );

  const content =
    step.type === "modal" ? (
      <div
        ref={dialogRef}
        className={gameTutorialOverlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-tutorial-title"
      >
        <div className={gameTutorialBackdrop} aria-hidden="true" />
        <div className={gameTutorialCard}>
          <h2 id="game-tutorial-title" className={gameTutorialCardTitle}>
            {step.title}
          </h2>
          <p className={gameTutorialCardBody}>{renderBody(step.body)}</p>
          {footer}
        </div>
      </div>
    ) : (
      (() => {
        const padding = step.target === "map" ? 10 : 8;
        const isInteractiveStep = Boolean(step.interactive);
        const spotlightStyle = targetRect
          ? {
              top: targetRect.top - padding,
              left: targetRect.left - padding,
              width: targetRect.width + padding * 2,
              height: targetRect.height + padding * 2,
            }
          : null;

        const placement = getSpotlightPlacement(step.target, targetRect, isMobile);
        const useMobileSheet = isMobile;
        const tooltipStyle = useMobileSheet
          ? undefined
          : getTooltipStyle(placement, targetRect, tooltipSize ?? undefined);
        const tooltipClassName = useMobileSheet
          ? gameTutorialTooltipMobileSheet
          : gameTutorialTooltip;
        const showArrow = !useMobileSheet && Boolean(spotlightStyle);

        return (
          <div
            ref={dialogRef}
            className={
              isInteractiveStep
                ? gameTutorialOverlaySpotlightInteractive
                : gameTutorialOverlaySpotlight
            }
            role="dialog"
            aria-modal={isInteractiveStep ? "false" : "true"}
            aria-labelledby="game-tutorial-title"
          >
            {spotlightStyle ? (
              <>
                <div
                  className={gameTutorialSpotlightRing}
                  style={spotlightStyle}
                  aria-hidden="true"
                />
                <div className={gameTutorialSpotlight} style={spotlightStyle} aria-hidden="true" />
              </>
            ) : (
              <div className={gameTutorialBackdrop} aria-hidden="true" />
            )}
            <div ref={tooltipRef} className={tooltipClassName} style={tooltipStyle}>
              {showArrow ? (
                <div
                  className={gameTutorialTooltipArrow}
                  data-placement={placement}
                  aria-hidden="true"
                />
              ) : null}
              <h2 id="game-tutorial-title" className={gameTutorialCardTitle}>
                {step.title}
              </h2>
              <p className={gameTutorialCardBody}>{renderBody(step.body)}</p>
              {footer}
            </div>
          </div>
        );
      })()
    );

  return createPortal(content, document.body);
}
