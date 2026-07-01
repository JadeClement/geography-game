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
  TARGET_HIGHLIGHT_COLOR,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import {
  geometryToPathData,
  PACIFIC_GAME_VIEW,
} from "@/lib/globeProjection";
import {
  CIRCLE_CLICK_RADIUS_PX,
  getBboxScreenSizePx,
  getCountryMeasureBbox,
  MIN_CLICK_TARGET_PX,
  SMALL_COUNTRY_FLASH_RADIUS_PX,
  TUTORIAL_CIRCLE_RADIUS_PX,
  TUTORIAL_CIRCLE_STROKE_COLOR,
  TUTORIAL_CIRCLE_STROKE_WIDTH,
} from "@/lib/geometry";
import { COUNTRY_CLICK_EXPAND_MS } from "@/lib/mapCountryClickExpand";
import { getCountryClickExpandEnabled } from "@/lib/countryClickExpandPrefs";
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

function getPacificCentroid(country) {
  return country.centroid;
}

function projectMeasureBboxToSvg(country, mapView) {
  const centroid = getPacificCentroid(country);
  const { minLng, minLat, maxLng, maxLat } = getCountryMeasureBbox(
    country.feature,
    country.id,
    centroid
  );
  const corners = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ];
  const projected = corners
    .map(([lng, lat]) => mapView.project(lng, lat, mapView.width, mapView.height))
    .filter(Boolean);
  if (projected.length === 0) return null;

  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

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
        centroid: getPacificCentroid(country),
        measureBbox: projectMeasureBboxToSvg(country, mapView),
      };
    })
    .filter(Boolean);
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
  onRegisterMapProject,
  onMapViewChange,
  mapControlsRef,
  forceShowSmallCountryCircles = false,
}) {
  const { theme } = useTheme();
  const colors = MAP_THEME_COLORS[theme] ?? MAP_THEME_COLORS[THEMES.DARK];
  const landColor = getActiveLandColor(theme);
  const [highlightVisible, setHighlightVisible] = useState(true);
  const [flashVisible, setFlashVisible] = useState(true);
  const [targetFlashVisible, setTargetFlashVisible] = useState(true);
  const [expandingCountryId, setExpandingCountryId] = useState(null);
  const [viewBox, setViewBox] = useState(getDefaultPacificViewBox);
  const [svgWidth, setSvgWidth] = useState(PACIFIC_MAP_WIDTH);

  const svgRef = useRef(null);
  const viewBoxRef = useRef(viewBox);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const expandTimeoutRef = useRef(null);

  viewBoxRef.current = viewBox;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const updateWidth = () => {
      setSvgWidth(svg.clientWidth || PACIFIC_MAP_WIDTH);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const getCountryScreenSizePx = useCallback(
    (country) => {
      if (!country.measureBbox) return MIN_CLICK_TARGET_PX;
      return getBboxScreenSizePx({
        ...country.measureBbox,
        viewWidth: viewBox.width,
        containerWidth: svgWidth,
      });
    },
    [svgWidth, viewBox.width]
  );

  const showCountryCircle = useCallback(
    (country) => {
      if (forceShowSmallCountryCircles && country.isSmall) return true;
      return shouldShowPacificCircle(country, getCountryScreenSizePx(country));
    },
    [forceShowSmallCountryCircles, getCountryScreenSizePx]
  );

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
    if (!flashSmallCountryId && !highlightCountryId) return undefined;

    const intervalId = setInterval(() => {
      setFlashVisible((visible) => !visible);
    }, 450);

    return () => clearInterval(intervalId);
  }, [flashSmallCountryId, highlightCountryId]);

  useEffect(() => {
    if (!highlightTargetCountryId || level !== GAME_LEVELS.NAME_FILL) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setTargetFlashVisible((visible) => !visible);
    }, 450);

    return () => clearInterval(intervalId);
  }, [highlightTargetCountryId, level]);

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

  useEffect(() => {
    onMapViewChange?.();
  }, [viewBox, onMapViewChange]);

  useEffect(() => {
    if (!onRegisterMapProject) return undefined;

    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!svg || !container) return undefined;

    onRegisterMapProject((country) => {
      const [lng, lat] = getPacificCentroid(country);
      const point = PACIFIC_GAME_VIEW.project(
        lng,
        lat,
        PACIFIC_GAME_VIEW.width,
        PACIFIC_GAME_VIEW.height
      );
      if (!point) return null;

      const [svgX, svgY] = point;
      const svgRect = svg.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const currentViewBox = viewBoxRef.current;

      return {
        x:
          ((svgX - currentViewBox.x) / currentViewBox.width) * svgRect.width +
          svgRect.left -
          containerRect.left,
        y:
          ((svgY - currentViewBox.y) / currentViewBox.height) * svgRect.height +
          svgRect.top -
          containerRect.top,
      };
    });

    return () => {
      onRegisterMapProject(null);
    };
  }, [onRegisterMapProject]);

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

  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
      }
    };
  }, []);

  const triggerCountryExpand = useCallback((countryId) => {
    if (!getCountryClickExpandEnabled()) return;

    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
    }

    setExpandingCountryId(null);
    requestAnimationFrame(() => {
      setExpandingCountryId(countryId);
      expandTimeoutRef.current = setTimeout(() => {
        setExpandingCountryId(null);
        expandTimeoutRef.current = null;
      }, COUNTRY_CLICK_EXPAND_MS);
    });
  }, []);

  const handleCountryPointer = useCallback(
    (countryId) => {
      if (suppressClickRef.current || !gameActive) return;
      triggerCountryExpand(countryId);
      onCountryClick({ properties: { id: countryId }, id: countryId });
    },
    [gameActive, onCountryClick, triggerCountryExpand]
  );

  const filledCountryIdSet = useMemo(() => new Set(filledCountryIds), [filledCountryIds]);

  const getCircleStroke = (countryId, assignedColor) => {
    const isWrong = wrongCountryIds.includes(countryId);
    const isFlashWrong = flashWrongCountryIds.includes(countryId);
    const isFilled = filledCountryIdSet.has(countryId);

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
            if (showCountryCircle(country)) {
              return null;
            }

            const fill = getPacificCountryFill({
              countryId: country.id,
              level,
              assignedColor: country.assignedColor,
              wrongCountryIds,
              flashWrongCountryIds,
              showColorCountryIds,
              filledCountryIdSet,
              highlightTargetCountryId,
              targetFlashOn: targetFlashVisible,
              isActive: true,
              activeLandColor: landColor,
            });

            return (
              <path
                key={country.id}
                d={country.path}
                fill={fill ?? landColor}
                fillRule="evenodd"
                className={cn(
                  "pacific-map-country",
                  gameActive && pacificMapCountryClickable,
                  expandingCountryId === country.id && "country-click-expanding"
                )}
                onPointerDown={handleCountryPointerDown}
                onClick={() => handleCountryPointer(country.id)}
              />
            );
          })}
        </g>

        <g className="pacific-map-circles">
          {activePaths.map((country) => {
            if (!showCountryCircle(country)) {
              return null;
            }

            const [lng, lat] = [country.centroid[0], country.centroid[1]];
            const point = PACIFIC_GAME_VIEW.project(
              lng,
              lat,
              PACIFIC_GAME_VIEW.width,
              PACIFIC_GAME_VIEW.height
            );
            if (!point) return null;

            const [cx, cy] = point;
            const isFlashing = flashSmallCountryId === country.id;
            const isHighlighted =
              highlightCountryId === country.id && showCountryCircle(country);
            const showFlashMarker = isFlashing || isHighlighted;
            const isTargetCircle =
              level === GAME_LEVELS.NAME_FILL &&
              highlightTargetCountryId === country.id;
            const baseStroke = getCircleStroke(country.id, country.assignedColor);
            const stroke =
              isTargetCircle && !forceShowSmallCountryCircles
                ? targetFlashVisible
                  ? TARGET_HIGHLIGHT_COLOR
                  : colors.smallCountryStroke
                : baseStroke;
            const circleFill =
              isTargetCircle && !forceShowSmallCountryCircles && targetFlashVisible
                ? TARGET_HIGHLIGHT_COLOR
                : "transparent";
            const circleRadius = forceShowSmallCountryCircles
              ? TUTORIAL_CIRCLE_RADIUS_PX
              : CIRCLE_CLICK_RADIUS_PX;
            const circleStroke = forceShowSmallCountryCircles
              ? TUTORIAL_CIRCLE_STROKE_COLOR
              : stroke;
            const circleStrokeWidth = forceShowSmallCountryCircles
              ? TUTORIAL_CIRCLE_STROKE_WIDTH
              : 2;

            return (
              <g key={`circle-${country.id}`} transform={`translate(${cx}, ${cy})`}>
                <g className={expandingCountryId === country.id ? "country-click-expanding" : undefined}>
                  <circle
                    cx={0}
                    cy={0}
                    r={circleRadius}
                    fill={circleFill}
                    stroke={circleStroke}
                    strokeWidth={circleStrokeWidth}
                    className={gameActive ? pacificMapCountryClickable : undefined}
                    onPointerDown={handleCountryPointerDown}
                    onClick={() => handleCountryPointer(country.id)}
                  />
                </g>
                {showFlashMarker && (
                  <g pointerEvents="none" className="pacific-map-small-flash">
                    <circle
                      cx={0}
                      cy={0}
                      r={SMALL_COUNTRY_FLASH_RADIUS_PX}
                      fill={WRONG_COUNTRY_COLOR}
                      fillOpacity={flashVisible ? 0.42 : 0.1}
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={SMALL_COUNTRY_FLASH_RADIUS_PX}
                      fill="transparent"
                      stroke={WRONG_COUNTRY_COLOR}
                      strokeWidth={3}
                      strokeOpacity={flashVisible ? 1 : 0.35}
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {highlightCountryId && (
          <g className="pacific-map-highlight" pointerEvents="none">
            {activePaths
              .filter(
                (country) =>
                  country.id === highlightCountryId && !showCountryCircle(country)
              )
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

      <div className={pacificMapControls} ref={mapControlsRef} aria-label="Map zoom controls">
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
