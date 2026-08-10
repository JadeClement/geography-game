import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0
  );
}

/**
 * Keeps keyboard focus inside an open dialog. Tab / Shift+Tab cycle within the
 * container; other keys (including Space) are unaffected.
 */
export function useFocusTrap(active) {
  const containerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    previouslyFocusedRef.current = document.activeElement;

    const focusables = getFocusableElements(container);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const onKeyDown = (event) => {
      if (event.key !== "Tab") return;

      const elements = getFocusableElements(container);
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === first || !container.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (container.getAttribute("tabindex") === "-1") {
        container.removeAttribute("tabindex");
      }
      const previous = previouslyFocusedRef.current;
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [active]);

  return containerRef;
}
