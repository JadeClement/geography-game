"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import FlagPrompt from "@/components/FlagPrompt";
import { cn } from "@/lib/cn";
import {
  discoverMapLabelFlagSettled,
  discoverMapLabelFlying,
  discoverMapLabelLayer,
  discoverMapLabelSettled,
} from "@/lib/ui";

const LABEL_ANIMATION_MS = 1300;
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

function LabelContent({ label, compact = false }) {
  if (label.kind === "flag" && label.iso2) {
    return (
      <FlagPrompt
        iso2={label.iso2}
        size="prompt"
        className={compact ? "h-5 w-auto rounded-sm border-0 shadow-none" : "h-8 w-auto"}
      />
    );
  }

  return <span>{label.text}</span>;
}

export default function DiscoverMapLabels({
  mapContainerRef,
  headerAnchorRef,
  mobileAnchorRef,
  labelsById,
  animatingLabel,
  countriesById,
  projectCountry,
  mapViewRevision,
  onLabelLanded,
}) {
  const [positions, setPositions] = useState({});
  const animElRef = useRef(null);
  const animationRef = useRef(null);

  const updatePositions = useCallback(() => {
    if (!projectCountry) return;

    const next = {};
    for (const [id] of Object.entries(labelsById)) {
      const country = countriesById[id];
      if (!country) continue;
      const pos = projectCountry(country);
      if (pos) next[id] = pos;
    }
    setPositions(next);
  }, [labelsById, countriesById, projectCountry]);

  useLayoutEffect(() => {
    updatePositions();
  }, [updatePositions, mapViewRevision]);

  useEffect(() => {
    const el = animElRef.current;
    if (!el || !animatingLabel || !projectCountry) return undefined;

    const country = countriesById[animatingLabel.countryId];
    if (!country) return undefined;

    const center = getMapCenterPoint(mapContainerRef);
    const target = projectCountry(country);
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
    onLabelLanded,
    projectCountry,
  ]);

  return (
    <div className={discoverMapLabelLayer} aria-hidden="true">
      {Object.entries(labelsById).map(([id, label]) => {
        const pos = positions[id];
        if (!pos) return null;

        return (
          <div
            key={id}
            className={cn(
              label.kind === "flag" ? discoverMapLabelFlagSettled : discoverMapLabelSettled
            )}
            style={{ left: pos.x, top: pos.y }}
          >
            <LabelContent label={label} compact />
          </div>
        );
      })}

      {animatingLabel && (
        <div ref={animElRef} className={discoverMapLabelFlying}>
          <LabelContent label={animatingLabel} />
        </div>
      )}
    </div>
  );
}
