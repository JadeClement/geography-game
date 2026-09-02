"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Shrinks font size so a single line of text fits the container width.
 * Uses the CSS font-size as the maximum and only scales down when needed.
 */
export default function FitText({ children, className, minFontPx = 10 }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return undefined;

    const fit = () => {
      container.style.fontSize = "";
      const maxPx = Number.parseFloat(getComputedStyle(container).fontSize);
      if (!Number.isFinite(maxPx) || maxPx <= 0) return;

      const available = container.clientWidth - 1;
      if (available <= 0) return;
      if (text.scrollWidth <= available) return;

      let next = Math.max(minFontPx, maxPx * (available / text.scrollWidth));
      for (let i = 0; i < 8; i += 1) {
        container.style.fontSize = `${next}px`;
        if (text.scrollWidth <= available || next <= minFontPx) return;
        next = Math.max(minFontPx, next * (available / text.scrollWidth));
      }
    };

    fit();

    let cancelled = false;
    let lastWidth = Math.round(container.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect?.width ?? 0);
      if (cancelled || width === lastWidth) return;
      lastWidth = width;
      fit();
    });
    observer.observe(container);
    document.fonts?.ready?.then(() => {
      if (!cancelled) fit();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [children, minFontPx]);

  return (
    <div
      ref={containerRef}
      className={cn("min-w-0 w-full overflow-hidden", className)}
    >
      <span ref={textRef} className="inline-block whitespace-nowrap">
        {children}
      </span>
    </div>
  );
}
