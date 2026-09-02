"use client";

import { useMemo } from "react";
import { geometryToFittedPath } from "@worldly/core/geo/silhouette";
import { cn } from "@/lib/cn";

const FILL = {
  idle: "var(--color-country-land)",
  correct: "var(--color-success)",
  wrong: "var(--color-error)",
  muted: "var(--color-text-muted)",
};

const STROKE = {
  idle: "var(--color-country-border)",
  correct: "color-mix(in srgb, var(--color-success) 70%, #0b1120)",
  wrong: "color-mix(in srgb, var(--color-error) 70%, #0b1120)",
  muted: "var(--color-text-muted)",
};

/**
 * Isolated country outline. The path is always drawn with a uniform scale;
 * `preserveAspectRatio="meet"` letterboxes inside the box so CSS cannot stretch
 * it. Size the *box* via `className`. `fit="aspect"` keeps the country's own
 * proportions. `feature` is the GeoJSON Feature from the runtime country.
 */
export default function CountrySilhouette({
  feature,
  countryId,
  tone = "idle",
  fit = "square",
  padding,
  preserveAspectRatio = "xMidYMid meet",
  className,
  style,
  label,
}) {
  const fitted = useMemo(
    () =>
      geometryToFittedPath(feature?.geometry, {
        iso3: countryId ?? feature?.properties?.id ?? null,
        fit,
        ...(padding != null ? { padding } : {}),
      }),
    [feature, countryId, fit, padding]
  );

  if (!fitted) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-text-muted",
          className
        )}
        style={style}
        aria-hidden={!label}
        aria-label={label || undefined}
      >
        {label ?? "—"}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center", className)} style={style}>
      <svg
        viewBox={fitted.viewBox}
        preserveAspectRatio={preserveAspectRatio}
        shapeRendering="geometricPrecision"
        className="h-full w-full max-h-full max-w-full"
        role={label ? "img" : "presentation"}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : true}
      >
        <path
          d={fitted.d}
          fill={FILL[tone] ?? FILL.idle}
          fillRule="evenodd"
          stroke={STROKE[tone] ?? STROKE.idle}
          strokeWidth="1.5"
          strokeLinejoin="miter"
          strokeMiterlimit="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
