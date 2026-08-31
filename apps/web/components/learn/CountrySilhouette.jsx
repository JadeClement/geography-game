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
 * Isolated country outline.
 *
 * `fit="square"` (default) letterboxes into a square — used in the 4-choice grid.
 * `fit="aspect"` keeps the country's proportions and fills the available width
 * so wide outlines (Russia) stay large enough to recognize.
 *
 * `feature` is the GeoJSON Feature from the runtime country object.
 */
export default function CountrySilhouette({
  feature,
  countryId,
  tone = "idle",
  fit = "square",
  className,
  label,
}) {
  const fitted = useMemo(
    () =>
      geometryToFittedPath(feature?.geometry, {
        iso3: countryId ?? feature?.properties?.id ?? null,
        fit,
      }),
    [feature, countryId, fit]
  );

  if (!fitted) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-text-muted",
          className
        )}
        aria-hidden={!label}
        aria-label={label || undefined}
      >
        {label ?? "—"}
      </div>
    );
  }

  const svg = (
    <svg
      viewBox={fitted.viewBox}
      className={
        fit === "aspect"
          ? "max-h-full max-w-full"
          : cn("block h-full w-full", className)
      }
      width={fit === "aspect" ? "100%" : undefined}
      height={fit === "aspect" ? "100%" : undefined}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
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
  );

  if (fit === "aspect") {
    return (
      <div
        className={cn(
          "mx-auto flex h-[min(24rem,50vh)] w-full items-center justify-center",
          className
        )}
      >
        {svg}
      </div>
    );
  }

  return svg;
}
