"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  mapContainer,
  pacificMap,
  pacificMapControlBtn,
  pacificMapControlBtnWide,
  pacificMapControls,
  pacificMapCountryClickable,
  pacificMapSvg,
} from "@/lib/ui";
import { useTheme } from "@/components/ThemeProvider";
import {
  CORRECT_COUNTRY_COLOR,
  getActiveLandColor,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import {
  geometryToPathData,
  PACIFIC_GAME_VIEW,
} from "@/lib/globeProjection";
import { CIRCLE_CLICK_RADIUS_PX } from "@/lib/geometry";
import { GAME_LEVELS } from "@/lib/levels";
import { getPacificCountryFill, shouldShowPacificCircle } from "@/lib/pacificMapStyles";
import {
  clientPointToSvg,
  getDefaultPacificViewBox,
  getPacificWorldViewBox,
  PACIFIC_MAP_HEIGHT,
  PACIFIC_MAP_WIDTH,
  PACIFIC_OCEAN_PADDING,
  panPacificViewBox,
  viewBoxToString,
  zoomPacificViewBox,
} from "@/lib/pacificMapView";
import { THEMES } from "@/lib/theme";

const PATH_TOLERANCE = 0.35;
const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_FACTOR = 1.12;
const BUTTON_ZOOM_FACTOR = 1.35;

const MAP_THEME_COLORS = {
  [THEMES.LIGHT]: {
    inactiveLand: "#f7f3eb",
    inactiveBorder: "#e5ddd0",
    ocean: "#bae6fd",
    smallCountryStroke: "#1e293b",
    levelBorder: "#334155",
  },
  [THEMES.DARK]: {
    inactiveLand: "#334155",
    inactiveBorder: "#475569",
    ocean: "#0c4a6e",
    smallCountryStroke: "#ffffff",
    levelBorder: "#e2e8f0",
  },
};

function buildCountryPaths(countries, mapView, colorMap, landColor) {
  return countries
    .map((country) => {
      const path = geometryToPathData(
        country.feature.geometry,
        PATH_TOLERANCE,
        mapView
      );
      if (!path) return null;

      return {
        id: country.id,
        path,
        assignedColor: colorMap[country.id] ?? landColor,
        isSmall: country.isSmall,
        centroid: country.centroid,
      };
    })
    .filter(Boolean);
}

const PACIFIC_CENTROID_OVERRIDES = {
  KIR: [173.0, 1.4],
};

function getPacificCentroid(country) {
  return PACIFIC_CENTROID_OVERRIDES[country.id] ?? country.centroid;
}

function isCountryEventTarget(target) {
  if (!(target instanceof Element)) return false;
  return (
    target.classList.contains("pacific-map-country") ||
    (target instanceof SVGCircleElement &&
      target.closest(".pacific-map-circles") &&
      target.getAttribute("fill") === "transparent")
  );
}

export default function PacificMap({
  activeCountries,
  inactiveCountries,
  countryColorMap,
  gameActive,
  level,
  wrongCountryIds,
  flashWrongCountryIds,
  showColorCountryIds,
  filledCountryIds,
  highlightTargetCountryId,
  highlightCountryId,
  flashSmallCountryId,
  onCountryClick,
}) {
  const { theme } = useTheme();
  const colors = MAP_THEME_COLORS[theme] ?? MAP_THEME_COLORS[THEMES.DARK];
  const landColor = getActiveLandColor(theme);
  const [highlightVisible, setHighlightVisible] = useState(true);
  const [flashVisible, setFlashVisible] = useState(true);
  const [viewBox, setViewBox] = useState(getDefaultPacificViewBox);

  const svgRef = useRef(null);
  const viewBoxRef = useRef(viewBox);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  viewBoxRef.current = viewBox;

  const inactivePaths = useMemo(
    () => buildCountryPaths(inactiveCountries, PACIFIC_GAME_VIEW, countryColorMap, landColor),
    [inactiveCountries, countryColorMap, landColor]
  );

  const activePaths = useMemo(
    () => buildCountryPaths(activeCountries, PACIFIC_GAME_VIEW, countryColorMap, landColor),
    [activeCountries, countryColorMap, landColor]
  );

  useEffect(() => {
    if (!highlightCountryId) return undefined;

    const intervalId = setInterval(() => {
      setHighlightVisible((visible) => !visible);
    }, 450);

    return () => clearInterval(intervalId);
  }, [highlightCountryId]);

  useEffect(() => {
    if (!flashSmallCountryId) return undefined;

    const intervalId = setInterval(() => {
      setFlashVisible((visible) => !visible);
    }, 450);

    return () => clearInterval(intervalId);
  }, [flashSmallCountryId]);

  const zoomAt = useCallback((factor, clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return;

    const focal = clientPointToSvg(svg, clientX, clientY);
    setViewBox((current) => zoomPacificViewBox(current, factor, focal.x, focal.y));
  }, []);

  const zoomIn = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    zoomAt(
      1 / BUTTON_ZOOM_FACTOR,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    zoomAt(
      BUTTON_ZOOM_FACTOR,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }, [zoomAt]);

  const resetView = useCallback(() => {
    setViewBox(getDefaultPacificViewBox());
  }, []);

  const showWorldView = useCallback(() => {
    setViewBox(getPacificWorldViewBox());
  }, []);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
    zoomAt(factor, event.clientX, event.clientY);
  }, [zoomAt]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (isCountryEventTarget(event.target)) return;

    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewBox: viewBoxRef.current,
      captured: false,
    };
  }, []);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.captured) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;

      suppressClickRef.current = true;
      drag.captured = true;
      svgRef.current?.setPointerCapture(event.pointerId);
    }

    const svg = svgRef.current;
    if (!svg) return;

    const scaleX = drag.viewBox.width / svg.clientWidth;
    const scaleY = drag.viewBox.height / svg.clientHeight;

    setViewBox(
      panPacificViewBox(drag.viewBox, -dx * scaleX, -dy * scaleY)
    );
  }, []);

  const handlePointerUp = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.captured) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }, []);

  const handleCountryPointerDown = useCallback((event) => {
    event.stopPropagation();
    suppressClickRef.current = false;
  }, []);

  const handleCountryPointer = useCallback(
    (countryId) => {
      if (suppressClickRef.current || !gameActive) return;
      onCountryClick({ properties: { id: countryId }, id: countryId });
    },
    [gameActive, onCountryClick]
  );

  const getCircleStroke = (countryId, assignedColor) => {
    const isWrong = wrongCountryIds.includes(countryId);
    const isFlashWrong = flashWrongCountryIds.includes(countryId);
    const isFilled = filledCountryIds.includes(countryId);

    if (level === GAME_LEVELS.FIND_FILL) {
      if (isFlashWrong || isWrong) return WRONG_COUNTRY_COLOR;
      if (isFilled) return assignedColor ?? landColor;
      return colors.smallCountryStroke;
    }

    if (isWrong) return WRONG_COUNTRY_COLOR;
    if (isFilled) return CORRECT_COUNTRY_COLOR;
    return colors.smallCountryStroke;
  };

  const oceanExtent = PACIFIC_OCEAN_PADDING;

  return (
    <div className={cn(mapContainer, pacificMap)}>
      <svg
        ref={svgRef}
        viewBox={viewBoxToString(viewBox)}
        className={pacificMapSvg}
        role="img"
        aria-label="Pacific region map"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <rect
          x={-oceanExtent}
          y={-oceanExtent}
          width={PACIFIC_MAP_WIDTH + oceanExtent * 2}
          height={PACIFIC_MAP_HEIGHT + oceanExtent * 2}
          className="pacific-map-ocean"
          fill={colors.ocean}
        />

        <g className="pacific-map-inactive" stroke={colors.inactiveBorder} strokeWidth="0.6">
          {inactivePaths.map((country) => (
            <path
              key={`inactive-${country.id}`}
              d={country.path}
              fill={colors.inactiveLand}
              fillRule="evenodd"
              aria-hidden="true"
            />
          ))}
        </g>

        <g
          className="pacific-map-active"
          stroke={colors.levelBorder}
          strokeWidth="0.75"
          strokeLinejoin="round"
        >
          {activePaths.map((country) => {
            if (shouldShowPacificCircle({ isSmall: country.isSmall })) {
              return null;
            }

            const fill = getPacificCountryFill({
              countryId: country.id,
              level,
              assignedColor: country.assignedColor,
              wrongCountryIds,
              flashWrongCountryIds,
              showColorCountryIds,
              filledCountryIds,
              highlightTargetCountryId,
              isActive: true,
              activeLandColor: landColor,
            });

            return (
              <path
                key={country.id}
                d={country.path}
                fill={fill ?? landColor}
                fillRule="evenodd"
                className={cn("pacific-map-country", gameActive && pacificMapCountryClickable)}
                onPointerDown={handleCountryPointerDown}
                onClick={() => handleCountryPointer(country.id)}
              />
            );
          })}
        </g>

        <g className="pacific-map-circles">
          {activePaths.map((country) => {
            if (!shouldShowPacificCircle({ isSmall: country.isSmall })) {
              return null;
            }

            const [lng, lat] = getPacificCentroid(country);
            const point = PACIFIC_GAME_VIEW.project(
              lng,
              lat,
              PACIFIC_GAME_VIEW.width,
              PACIFIC_GAME_VIEW.height
            );
            if (!point) return null;

            const [cx, cy] = point;
            const isFlashing = flashSmallCountryId === country.id;
            const stroke = getCircleStroke(country.id, country.assignedColor);

            return (
              <g key={`circle-${country.id}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={CIRCLE_CLICK_RADIUS_PX}
                  fill="transparent"
                  stroke={stroke}
                  strokeWidth={2}
                  className={gameActive ? pacificMapCountryClickable : undefined}
                  onPointerDown={handleCountryPointerDown}
                  onClick={() => handleCountryPointer(country.id)}
                />
                {isFlashing && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={CIRCLE_CLICK_RADIUS_PX + 2}
                    fill="transparent"
                    stroke={WRONG_COUNTRY_COLOR}
                    strokeWidth={3}
                    strokeOpacity={flashVisible ? 0.95 : 0.15}
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
        </g>

        {highlightCountryId && (
          <g className="pacific-map-highlight" pointerEvents="none">
            {activePaths
              .filter((country) => country.id === highlightCountryId)
              .map((country) => (
                <path
                  key={`highlight-${country.id}`}
                  d={country.path}
                  fill={WRONG_COUNTRY_COLOR}
                  fillOpacity={highlightVisible ? 0.75 : 0.15}
                  fillRule="evenodd"
                  stroke={WRONG_COUNTRY_COLOR}
                  strokeWidth={1.5}
                />
              ))}
          </g>
        )}
      </svg>

      <div className={pacificMapControls} aria-label="Map zoom controls">
        <button type="button" className={pacificMapControlBtn} onClick={zoomIn} aria-label="Zoom in">
          +
        </button>
        <button type="button" className={pacificMapControlBtn} onClick={zoomOut} aria-label="Zoom out">
          −
        </button>
        <button type="button" className={pacificMapControlBtn} onClick={resetView} aria-label="Reset to Oceania view">
          ⌂
        </button>
        <button
          type="button"
          className={cn(pacificMapControlBtn, pacificMapControlBtnWide)}
          onClick={showWorldView}
          aria-label="Show entire world map"
        >
          ⊕
        </button>
      </div>
    </div>
  );
}
