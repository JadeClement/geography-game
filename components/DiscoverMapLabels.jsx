"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import FlagPrompt from "@/components/FlagPrompt";
import { cn } from "@/lib/cn";
import { layoutDiscoverLabelsFromElements } from "@/lib/discoverLabelLayout";
import { getDiscoverFlagSizeFactor } from "@/lib/discoverLabelScale";
import { isDiscoverLabelVisible } from "@/lib/discoverLabelVisibility";
import {
  discoverMapLabelFlagSettled,
  discoverMapLabelFlying,
  discoverMapLabelItemsLayer,
  discoverMapLabelLayer,
  discoverMapLabelLeaderLayer,
  discoverMapLabelPlaced,
  discoverMapLabelSettled,
  discoverMapLabelText,
  discoverMapLabelTextFlying,
  discoverMapLabelTextShadow,
} from "@/lib/ui";

const LABEL_ANIMATION_MS = 1300;
const MAP_EDGE_PADDING = 4;
// Flying label uses text-2xl; settled labels use 0.875rem — match visual size at landing.
const SETTLED_SCALE = 0.58;

function getMapCenterPoint(mapContainerRef) {
  const map = mapContainerRef?.current;
  if (!map) return null;

  return {
    x: map.clientWidth / 2,
    y: map.clientHeight / 2,
  };
}

function LabelContent({ label, compact = false, flying = false, scale = 1 }) {
  if (label.kind === "flag" && label.iso2) {
    const baseHeight = compact ? 20 : 32;
    const height = baseHeight * (Number.isFinite(scale) && scale > 0 ? scale : 1);
    return (
      <FlagPrompt
        iso2={label.iso2}
        size="prompt"
        className="h-auto w-auto rounded-sm border-0 shadow-none"
        style={{ height }}
      />
    );
  }

  const baseRem = flying ? 1.5 : 0.8125;
  return (
    <span
      className={flying ? discoverMapLabelTextFlying : discoverMapLabelText}
      style={scale !== 1 ? { fontSize: `${baseRem * scale}rem` } : undefined}
    >
      {label.text}
    </span>
  );
}

export default function DiscoverMapLabels({
  mapContainerRef,
  headerAnchorRef,
  mobileAnchorRef,
  labelsById,
  animatingLabel,
  countriesById,
  projectCountry,
  projectDiscoverAnchor,
  projectCountryBounds,
  getDiscoverLabelScale,
  mapViewRevision,
  hoveredCountryId,
  learnMorePanelRef,
  learnMorePanelActive = false,
  onLabelLanded,
}) {
  const [labelLayouts, setLabelLayouts] = useState({});
  const [layoutRightInset, setLayoutRightInset] = useState(0);
  const labelRefs = useRef({});
  const lastLayoutKeyRef = useRef(null);
  const animElRef = useRef(null);
  const animationRef = useRef(null);

  const labelScale = useMemo(() => {
    return getDiscoverLabelScale?.() ?? 1;
  }, [getDiscoverLabelScale, mapViewRevision]);

  const positions = useMemo(() => {
    const container = mapContainerRef.current;
    if (!container) return {};

    const viewportRect = {
      left: MAP_EDGE_PADDING,
      top: MAP_EDGE_PADDING,
      right: container.clientWidth - layoutRightInset - MAP_EDGE_PADDING,
      bottom: container.clientHeight - MAP_EDGE_PADDING,
    };

    const next = {};
    for (const [id] of Object.entries(labelsById)) {
      const country = countriesById[id];
      if (!country) continue;

      // Only place a label when the country itself is on-screen.
      const pos = projectDiscoverAnchor?.(country, viewportRect);
      if (pos) next[id] = pos;
    }
    return next;
  }, [
    labelsById,
    countriesById,
    layoutRightInset,
    projectDiscoverAnchor,
    mapViewRevision,
    mapContainerRef,
  ]);

  /** Per-country render scale (zoom × flag size factor for flags; zoom only for text). */
  const labelScalesById = useMemo(() => {
    const next = {};
    for (const [id, label] of Object.entries(labelsById)) {
      if (label.kind !== "flag") {
        next[id] = labelScale;
        continue;
      }
      const country = countriesById[id];
      const countryBounds = country ? projectCountryBounds?.(country) ?? null : null;
      const flagFactor = getDiscoverFlagSizeFactor(countryBounds, {
        isSmall: Boolean(country?.isSmall),
      });
      next[id] = labelScale * flagFactor;
    }
    return next;
  }, [
    countriesById,
    labelScale,
    labelsById,
    mapViewRevision,
    projectCountryBounds,
  ]);

  const layoutKey = useMemo(
    () =>
      JSON.stringify({
        ids: Object.keys(labelsById),
        positions,
        mapViewRevision,
        layoutRightInset,
        labelScale,
        labelScalesById,
      }),
    [labelsById, layoutRightInset, mapViewRevision, positions, labelScale, labelScalesById]
  );

  const needsLayout = lastLayoutKeyRef.current !== layoutKey;

  const labelVisibility = useMemo(() => {
    const visibility = {};
    const otherLabelRects = {};
    for (const [id, layout] of Object.entries(labelLayouts)) {
      if (layout?.rect) otherLabelRects[id] = layout.rect;
    }

    const allCountryBounds = projectCountryBounds
      ? Object.values(countriesById)
          .map((country) => projectCountryBounds(country))
          .filter(Boolean)
      : [];

    for (const [id, label] of Object.entries(labelsById)) {
      const layout = labelLayouts[id];
      const anchor = positions[id];
      const country = countriesById[id];
      if (!layout || !anchor || !country) {
        visibility[id] = true;
        continue;
      }

      const labelWidth = layout.rect.right - layout.rect.left;
      const labelHeight = layout.rect.bottom - layout.rect.top;
      const countryBounds = projectCountryBounds?.(country) ?? null;

      visibility[id] = isDiscoverLabelVisible({
        labelWidth,
        labelHeight,
        countryBounds,
        anchor,
        isSmallCountry: country.isSmall,
        layoutRect: layout.rect,
        countryId: id,
        otherLabelRects,
        allCountryBounds,
        hoveredCountryId,
        isAnimating: animatingLabel?.countryId === id,
        alwaysShow: label.kind === "flag",
      });
    }

    return visibility;
  }, [
    animatingLabel,
    countriesById,
    hoveredCountryId,
    labelLayouts,
    labelsById,
    positions,
    projectCountryBounds,
  ]);

  useLayoutEffect(() => {
    const container = mapContainerRef.current;
    const panel = learnMorePanelRef?.current;

    const measureInset = () => {
      if (!container || !panel) {
        setLayoutRightInset(0);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const overlap = Math.max(0, containerRect.right - panelRect.left);
      setLayoutRightInset(overlap);
    };

    measureInset();

    const observer = new ResizeObserver(measureInset);
    if (container) observer.observe(container);
    if (panel) observer.observe(panel);

    return () => observer.disconnect();
  }, [learnMorePanelActive, learnMorePanelRef, mapContainerRef, mapViewRevision]);

  useLayoutEffect(() => {
    const container = mapContainerRef.current;
    if (!container || Object.keys(labelsById).length === 0) {
      setLabelLayouts({});
      lastLayoutKeyRef.current = layoutKey;
      return;
    }

    const layouts = layoutDiscoverLabelsFromElements({
      labelsById,
      positions,
      labelElements: labelRefs.current,
      containerRect: container.getBoundingClientRect(),
      countriesById,
      projectCountryBounds,
      layoutInsets: { right: layoutRightInset },
    });

    setLabelLayouts(layouts);
    lastLayoutKeyRef.current = layoutKey;
  }, [
    countriesById,
    labelsById,
    layoutKey,
    layoutRightInset,
    mapContainerRef,
    positions,
    projectCountryBounds,
  ]);

  useEffect(() => {
    const el = animElRef.current;
    if (!el || !animatingLabel || !projectCountry) return undefined;

    const country = countriesById[animatingLabel.countryId];
    if (!country) return undefined;

    const center = getMapCenterPoint(mapContainerRef);
    const container = mapContainerRef.current;
    const viewportRect = container
      ? {
          left: MAP_EDGE_PADDING,
          top: MAP_EDGE_PADDING,
          right: container.clientWidth - layoutRightInset - MAP_EDGE_PADDING,
          bottom: container.clientHeight - MAP_EDGE_PADDING,
        }
      : null;
    const target =
      (viewportRect && projectDiscoverAnchor?.(country, viewportRect)) ??
      projectCountry?.(country);
    if (!center || !target) return undefined;

    if (animationRef.current) {
      animationRef.current.cancel();
      animationRef.current = null;
    }

    const lerp = (from, to, t) => from + (to - from) * t;

    const flySteps = [
      { offset: 0.38, progress: 0, scale: 1.06 },
      { offset: 0.52, progress: 0.22, scale: 0.86 },
      { offset: 0.66, progress: 0.48, scale: 0.72 },
      { offset: 0.78, progress: 0.72, scale: 0.62 },
      { offset: 0.88, progress: 0.9, scale: 0.57 },
      { offset: 0.94, progress: 1, scale: 0.56, bounceY: 10 },
      { offset: 1, progress: 1, scale: SETTLED_SCALE },
    ];

    const animation = el.animate(
      [
        {
          left: `${center.x}px`,
          top: `${center.y}px`,
          transform: "translate(-50%, -50%) scale(0.18)",
          opacity: 0,
        },
        {
          left: `${center.x}px`,
          top: `${center.y}px`,
          transform: "translate(-50%, -50%) scale(0.18)",
          opacity: 1,
          offset: 0.06,
        },
        {
          left: `${center.x}px`,
          top: `${center.y}px`,
          transform: "translate(-50%, -50%) scale(1.32)",
          opacity: 1,
          offset: 0.28,
        },
        ...flySteps.map(({ offset, progress, scale, bounceY = 0 }) => {
          const translateY = lerp(-50, -100, progress);
          return {
            left: `${lerp(center.x, target.x, progress)}px`,
            top: `${lerp(center.y, target.y, progress) + bounceY}px`,
            transform: `translate(-50%, ${translateY}%) scale(${scale})`,
            opacity: 1,
            offset,
          };
        }),
      ],
      {
        duration: LABEL_ANIMATION_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      }
    );

    animationRef.current = animation;

    animation.finished
      .then(() => {
        if (animationRef.current !== animation) return;
        onLabelLanded(animatingLabel);
      })
      .catch(() => {});

    return () => {
      animation.cancel();
      if (animationRef.current === animation) {
        animationRef.current = null;
      }
    };
  }, [
    animatingLabel,
    countriesById,
    mapContainerRef,
    layoutRightInset,
    onLabelLanded,
    projectCountry,
    projectDiscoverAnchor,
  ]);

  return (
    <div
      className={discoverMapLabelLayer}
      style={{
        "--discover-label-shadow": discoverMapLabelTextShadow,
        ...(layoutRightInset > 0
          ? { right: layoutRightInset, overflow: "hidden" }
          : null),
      }}
      aria-hidden="true"
    >
      {!needsLayout && (
        <svg className={discoverMapLabelLeaderLayer}>
          {Object.entries(labelLayouts).map(([id, layout]) => {
            if (!labelVisibility[id]) return null;
            if (!layout.showLeader || !layout.leader) return null;
            return (
              <line
                key={id}
                x1={layout.anchor.x}
                y1={layout.anchor.y}
                x2={layout.leader.x}
                y2={layout.leader.y}
                stroke="#000"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
      )}

      <div className={discoverMapLabelItemsLayer}>
        {Object.entries(labelsById).map(([id, label]) => {
          const anchor = positions[id];
          if (!anchor) return null;

          const layout = labelLayouts[id];
          const isFlag = label.kind === "flag";
          const measuring = needsLayout || !layout;
          const isVisible = measuring || labelVisibility[id] !== false;

          return (
            <div
              key={id}
              ref={(node) => {
                if (node) labelRefs.current[id] = node;
                else delete labelRefs.current[id];
              }}
              className={cn(
                measuring
                  ? isFlag
                    ? discoverMapLabelFlagSettled
                    : discoverMapLabelSettled
                  : discoverMapLabelPlaced,
                measuring && "opacity-0",
                !measuring && !isVisible && "pointer-events-none opacity-0"
              )}
              style={
                measuring
                  ? { left: anchor.x, top: anchor.y }
                  : { left: layout.left, top: layout.top }
              }
            >
              <LabelContent
                label={label}
                compact
                scale={labelScalesById[id] ?? labelScale}
              />
            </div>
          );
        })}

        {animatingLabel && (
          <div ref={animElRef} className={discoverMapLabelFlying}>
            <LabelContent label={animatingLabel} flying />
          </div>
        )}
      </div>
    </div>
  );
}
