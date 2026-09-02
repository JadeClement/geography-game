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
  MISSED_COUNTRY_COLOR,
  SUBJECT_COUNTRY_COLOR,
  SUBJECT_COUNTRY_OUTLINE,
  TARGET_HIGHLIGHT_COLOR,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import {
  geometryToPathData,
  PACIFIC_GAME_VIEW,
  unprojectPacificSvg,
} from "@/lib/globeProjection";
import {
  CIRCLE_CLICK_RADIUS_PX,
  CIRCLE_STROKE_WIDTH,
  getBboxScreenSizePx,
  getCountryMeasureBbox,
  getCountryFillScreenBounds,
  getCountryVisibleScreenAnchor,
  projectMainlandRings,
  MIN_CLICK_TARGET_PX,
  SMALL_COUNTRY_FLASH_RADIUS_PX,
  TUTORIAL_CIRCLE_RADIUS_PX,
  TUTORIAL_CIRCLE_STROKE_COLOR,
  TUTORIAL_CIRCLE_STROKE_WIDTH,
} from "@/lib/geometry";
import { getDiscoverLabelScale as getDiscoverLabelScaleFromRatio } from "@/lib/discoverLabelScale";
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
        territory: Boolean(country.displayOnly || country.feature?.properties?.territory),
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

function InactiveLandPath({
  country,
  fill,
  clickable,
  onPointerDown,
  onClick,
}) {
  return (
    <path
      d={country.path}
      fill={fill}
      fillRule="evenodd"
      aria-hidden="true"
      className={clickable ? pacificMapCountryClickable : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
    />
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
  secondTryCountryIds = [],
  correctCountryIds = [],
  missedCountryIds = [],
  neighborWrongIds = [],
  highlightTargetCountryId,
  highlightCountryId,
  // "prompt" = yellow (which-country-is-highlighted); "error" = red (find reveal).
  highlightTone = "prompt",
  flashSmallCountryId,
  onCountryClick,
  onCountryHover,
  onRegisterMapProject,
  onMapViewChange,
  onMapMove,
  mapControlsRef,
  forceShowSmallCountryCircles = false,
  allowInactiveCountryClicks = false,
  mapNavigationEnabled = true,
  hideCountryBorders = false,
  allowEmptyMapClicks = false,
  distanceFeedback = null,
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
  const mapNavigationEnabledRef = useRef(mapNavigationEnabled);

  viewBoxRef.current = viewBox;
  mapNavigationEnabledRef.current = mapNavigationEnabled;

  useEffect(() => {
    if (mapNavigationEnabled) return;
    setViewBox(getDefaultPacificViewBox());
  }, [mapNavigationEnabled]);

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
      const isFeedback =
        wrongCountryIds.includes(country.id) ||
        flashWrongCountryIds.includes(country.id) ||
        filledCountryIds.includes(country.id) ||
        highlightCountryId === country.id;
      if (hideCountryBorders && !isFeedback) return false;
      if (forceShowSmallCountryCircles && country.isSmall) return true;
      return shouldShowPacificCircle(country, getCountryScreenSizePx(country));
    },
    [
      forceShowSmallCountryCircles,
      getCountryScreenSizePx,
      hideCountryBorders,
      wrongCountryIds,
      flashWrongCountryIds,
      filledCountryIds,
      highlightCountryId,
    ]
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
    if (!highlightCountryId || highlightTone === "success" || highlightTone === "correct") {
      setHighlightVisible(true);
      return undefined;
    }

    const intervalId = setInterval(() => {
      setHighlightVisible((visible) => !visible);
    }, 450);

    return () => clearInterval(intervalId);
  }, [highlightCountryId, highlightTone]);

  useEffect(() => {
    if ((!flashSmallCountryId && !highlightCountryId) || highlightTone === "success" || highlightTone === "correct") {
      if (highlightTone === "success" || highlightTone === "correct") setFlashVisible(true);
      return undefined;
    }

    const intervalId = setInterval(() => {
      setFlashVisible((visible) => !visible);
    }, 450);

    return () => clearInterval(intervalId);
  }, [flashSmallCountryId, highlightCountryId, highlightTone]);

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
    if (!mapNavigationEnabledRef.current) return;
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
    onMapMove?.();
    onMapViewChange?.();
  }, [viewBox, onMapMove, onMapViewChange]);

  useEffect(() => {
    if (!onRegisterMapProject) return undefined;

    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!svg || !container) return undefined;

    function toContainerPoint(svgX, svgY) {
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
    }

    onRegisterMapProject({
      projectPoint(country) {
        const [lng, lat] = getPacificCentroid(country);
        const point = PACIFIC_GAME_VIEW.project(
          lng,
          lat,
          PACIFIC_GAME_VIEW.width,
          PACIFIC_GAME_VIEW.height
        );
        if (!point) return null;

        return toContainerPoint(point[0], point[1]);
      },
      projectBounds(country) {
        const svgBounds = projectMeasureBboxToSvg(country, PACIFIC_GAME_VIEW);
        if (!svgBounds) return null;

        const nw = toContainerPoint(svgBounds.minX, svgBounds.minY);
        const se = toContainerPoint(svgBounds.maxX, svgBounds.maxY);

        return {
          countryId: country.id,
          left: Math.min(nw.x, se.x),
          top: Math.min(nw.y, se.y),
          right: Math.max(nw.x, se.x),
          bottom: Math.max(nw.y, se.y),
        };
      },
      projectBoundsClient(country) {
        const svgRect = svg.getBoundingClientRect();
        const currentViewBox = viewBoxRef.current;
        const projectToClient = (lng, lat) => {
          const point = PACIFIC_GAME_VIEW.project(
            lng,
            lat,
            PACIFIC_GAME_VIEW.width,
            PACIFIC_GAME_VIEW.height
          );
          if (!point) return null;
          return {
            x:
              ((point[0] - currentViewBox.x) / currentViewBox.width) * svgRect.width +
              svgRect.left,
            y:
              ((point[1] - currentViewBox.y) / currentViewBox.height) * svgRect.height +
              svgRect.top,
          };
        };
        const bounds = getCountryFillScreenBounds(country, projectToClient);
        if (!bounds) return null;
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        if (!(width > 2) || !(height > 2)) return null;
        return {
          left: bounds.left,
          top: bounds.top,
          width,
          height,
        };
      },
      projectMainlandRingsClient(country) {
        const svgRect = svg.getBoundingClientRect();
        const currentViewBox = viewBoxRef.current;
        const projectToClient = (lng, lat) => {
          const point = PACIFIC_GAME_VIEW.project(
            lng,
            lat,
            PACIFIC_GAME_VIEW.width,
            PACIFIC_GAME_VIEW.height
          );
          if (!point) return null;
          return {
            x:
              ((point[0] - currentViewBox.x) / currentViewBox.width) * svgRect.width +
              svgRect.left,
            y:
              ((point[1] - currentViewBox.y) / currentViewBox.height) * svgRect.height +
              svgRect.top,
          };
        };
        return projectMainlandRings(country, projectToClient);
      },
      projectDiscoverAnchor(country, viewportRect) {
        return getCountryVisibleScreenAnchor(
          country,
          (lng, lat) => {
            const point = PACIFIC_GAME_VIEW.project(
              lng,
              lat,
              PACIFIC_GAME_VIEW.width,
              PACIFIC_GAME_VIEW.height
            );
            if (!point) return null;
            return toContainerPoint(point[0], point[1]);
          },
          viewportRect
        );
      },
      getDiscoverLabelScale() {
        const current = viewBoxRef.current;
        const defaultViewBox = getDefaultPacificViewBox();
        const zoomRatio = defaultViewBox.width / current.width;
        return getDiscoverLabelScaleFromRatio(zoomRatio);
      },
      projectClient(lng, lat) {
        const svgRect = svg.getBoundingClientRect();
        const currentViewBox = viewBoxRef.current;
        const point = PACIFIC_GAME_VIEW.project(
          lng,
          lat,
          PACIFIC_GAME_VIEW.width,
          PACIFIC_GAME_VIEW.height
        );
        if (!point) return null;
        return {
          x:
            ((point[0] - currentViewBox.x) / currentViewBox.width) * svgRect.width +
            svgRect.left,
          y:
            ((point[1] - currentViewBox.y) / currentViewBox.height) * svgRect.height +
            svgRect.top,
        };
      },
      unprojectClient(clientX, clientY) {
        const pt = clientPointToSvg(svg, clientX, clientY);
        return unprojectPacificSvg(pt.x, pt.y, PACIFIC_GAME_VIEW);
      },
    });

    return () => {
      onRegisterMapProject(null);
    };
  }, [onRegisterMapProject]);

  const handlePointerDown = useCallback((event) => {
    if (!mapNavigationEnabledRef.current) return;
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
    if (!mapNavigationEnabledRef.current) return;
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
    (countryId, { inactive = false, event = null } = {}) => {
      if (suppressClickRef.current || !gameActive) return;
      if (!inactive && !hideCountryBorders) triggerCountryExpand(countryId);
      let lngLat = null;
      if (event && svgRef.current) {
        const pt = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
        lngLat = unprojectPacificSvg(pt.x, pt.y, PACIFIC_GAME_VIEW);
      }
      onCountryClick({ properties: { id: countryId }, id: countryId }, { inactive, lngLat });
    },
    [gameActive, hideCountryBorders, onCountryClick, triggerCountryExpand]
  );

  const handleCountryHover = useCallback(
    (countryId) => {
      onCountryHover?.(countryId);
    },
    [onCountryHover]
  );

  const handleSvgClick = useCallback(
    (event) => {
      if (suppressClickRef.current || !gameActive || !allowEmptyMapClicks) return;
      if (isCountryEventTarget(event.target)) return;
      const pt = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
      const lngLat = unprojectPacificSvg(pt.x, pt.y, PACIFIC_GAME_VIEW);
      onCountryClick?.(null, { lngLat, empty: true });
    },
    [allowEmptyMapClicks, gameActive, onCountryClick]
  );

  const distanceOverlaySvg = useMemo(() => {
    if (!distanceFeedback?.from || !distanceFeedback?.to || distanceFeedback.correct) {
      return null;
    }
    const from = PACIFIC_GAME_VIEW.project(
      distanceFeedback.from.lng,
      distanceFeedback.from.lat,
      PACIFIC_GAME_VIEW.width,
      PACIFIC_GAME_VIEW.height
    );
    const to = PACIFIC_GAME_VIEW.project(
      distanceFeedback.to.lng,
      distanceFeedback.to.lat,
      PACIFIC_GAME_VIEW.width,
      PACIFIC_GAME_VIEW.height
    );
    if (!from || !to) return null;
    return { from, to, label: distanceFeedback.label ?? "" };
  }, [distanceFeedback]);

  const filledCountryIdSet = useMemo(() => new Set(filledCountryIds), [filledCountryIds]);

  const getCircleStroke = (countryId, assignedColor) => {
    const isWrong =
      neighborWrongIds.includes(countryId) || wrongCountryIds.includes(countryId);
    const isFlashWrong = flashWrongCountryIds.includes(countryId);
    const isFilled = filledCountryIdSet.has(countryId);
    const isSecondTry = secondTryCountryIds.includes(countryId);
    const showColor = showColorCountryIds.includes(countryId);
    const isCorrect = correctCountryIds.includes(countryId);
    const isMissed = missedCountryIds.includes(countryId);

    if (level === GAME_LEVELS.FIND_FILL) {
      if (isFlashWrong || isWrong) return WRONG_COUNTRY_COLOR;
      if (isMissed) return MISSED_COUNTRY_COLOR;
      if (isCorrect) return CORRECT_COUNTRY_COLOR;
      if (isSecondTry) return TARGET_HIGHLIGHT_COLOR;
      if (isFilled || showColor) return assignedColor ?? landColor;
      return colors.smallCountryStroke;
    }

    if (isWrong) return WRONG_COUNTRY_COLOR;
    if (isSecondTry) return TARGET_HIGHLIGHT_COLOR;
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
        onClick={handleSvgClick}
      >
        <rect
          x={-oceanExtent}
          y={-oceanExtent}
          width={PACIFIC_MAP_WIDTH + oceanExtent * 2}
          height={PACIFIC_MAP_HEIGHT + oceanExtent * 2}
          className="pacific-map-ocean"
          fill={colors.ocean}
        />

        <g className="pacific-map-inactive" stroke="none" strokeWidth={0}>
          {inactivePaths
            .filter((country) => !country.territory)
            .map((country) => (
              <InactiveLandPath
                key={`inactive-${country.id}`}
                country={country}
                fill={colors.inactiveLand}
                clickable={gameActive && allowInactiveCountryClicks}
                onPointerDown={
                  allowInactiveCountryClicks ? handleCountryPointerDown : undefined
                }
                onClick={
                  allowInactiveCountryClicks
                    ? (event) => handleCountryPointer(country.id, { inactive: true, event })
                    : undefined
                }
              />
            ))}
        </g>
        <g
          className="pacific-map-inactive-territories"
          stroke={hideCountryBorders ? "none" : colors.inactiveBorder}
          strokeWidth={hideCountryBorders ? 0 : "0.6"}
        >
          {inactivePaths
            .filter((country) => country.territory)
            .map((country) => (
              <InactiveLandPath
                key={`inactive-territory-${country.id}`}
                country={country}
                fill={colors.inactiveLand}
                clickable={gameActive && allowInactiveCountryClicks}
                onPointerDown={
                  allowInactiveCountryClicks ? handleCountryPointerDown : undefined
                }
                onClick={
                  allowInactiveCountryClicks
                    ? (event) => handleCountryPointer(country.id, { inactive: true, event })
                    : undefined
                }
              />
            ))}
        </g>

        <g
          className="pacific-map-active"
          stroke={hideCountryBorders ? "none" : colors.levelBorder}
          strokeWidth={hideCountryBorders ? 0 : "0.75"}
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
              secondTryCountryIds,
              correctCountryIds,
              missedCountryIds,
              neighborWrongIds,
              highlightTargetCountryId,
              highlightCountryId,
              highlightTone,
              targetFlashOn: targetFlashVisible,
              isActive: true,
              activeLandColor: landColor,
            });

            const isWrong =
              neighborWrongIds.includes(country.id) ||
              wrongCountryIds.includes(country.id);
            const isCorrectHighlight =
              highlightCountryId === country.id && highlightTone === "correct";
            const outline =
              isWrong
                ? WRONG_COUNTRY_COLOR
                : isCorrectHighlight
                  ? CORRECT_COUNTRY_COLOR
                  : undefined;

            return (
              <path
                key={country.id}
                d={country.path}
                fill={fill ?? landColor}
                fillRule="evenodd"
                stroke={outline}
                strokeWidth={outline && outline !== "none" ? 1.75 : undefined}
                className={cn(
                  "pacific-map-country",
                  gameActive && pacificMapCountryClickable,
                  expandingCountryId === country.id && "country-click-expanding"
                )}
                onPointerDown={handleCountryPointerDown}
                onClick={(event) => handleCountryPointer(country.id, { event })}
                onPointerEnter={() => handleCountryHover(country.id)}
                onPointerLeave={() => handleCountryHover(null)}
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
            const flashMarkerColor =
              isFlashing || highlightTone === "error"
                ? WRONG_COUNTRY_COLOR
                : highlightTone === "success"
                  ? SUBJECT_COUNTRY_COLOR
                  : highlightTone === "correct"
                    ? CORRECT_COUNTRY_COLOR
                    : TARGET_HIGHLIGHT_COLOR;
            const isTargetCircle =
              level === GAME_LEVELS.NAME_FILL &&
              highlightTargetCountryId === country.id &&
              !secondTryCountryIds.includes(country.id) &&
              !filledCountryIdSet.has(country.id);
            const baseStroke = getCircleStroke(country.id, country.assignedColor);
            const stroke =
              isTargetCircle && !forceShowSmallCountryCircles
                ? targetFlashVisible
                  ? TARGET_HIGHLIGHT_COLOR
                  : colors.smallCountryStroke
                : isHighlighted && !forceShowSmallCountryCircles
                  ? flashVisible
                    ? flashMarkerColor
                    : colors.smallCountryStroke
                  : baseStroke;
            const showColor =
              showColorCountryIds.includes(country.id) ||
              filledCountryIdSet.has(country.id);
            const isSecondTryCircle = secondTryCountryIds.includes(country.id);
            const teachFill = neighborWrongIds.includes(country.id)
              ? WRONG_COUNTRY_COLOR
              : missedCountryIds.includes(country.id)
                ? MISSED_COUNTRY_COLOR
                : correctCountryIds.includes(country.id)
                  ? CORRECT_COUNTRY_COLOR
                  : null;
            const circleFill =
              teachFill ??
              (isSecondTryCircle
                ? TARGET_HIGHLIGHT_COLOR
                : isTargetCircle && !forceShowSmallCountryCircles && targetFlashVisible
                ? TARGET_HIGHLIGHT_COLOR
                : showColor
                  ? (country.assignedColor ?? landColor)
                  : "transparent");
            const circleRadius = forceShowSmallCountryCircles
              ? TUTORIAL_CIRCLE_RADIUS_PX
              : CIRCLE_CLICK_RADIUS_PX;
            const circleStroke = forceShowSmallCountryCircles
              ? TUTORIAL_CIRCLE_STROKE_COLOR
              : stroke;
            const circleStrokeWidth = forceShowSmallCountryCircles
              ? TUTORIAL_CIRCLE_STROKE_WIDTH
              : CIRCLE_STROKE_WIDTH;

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
                    onClick={(event) => handleCountryPointer(country.id, { event })}
                    onPointerEnter={() => handleCountryHover(country.id)}
                    onPointerLeave={() => handleCountryHover(null)}
                  />
                </g>
                {showFlashMarker && (
                  <g pointerEvents="none" className="pacific-map-small-flash">
                    <circle
                      cx={0}
                      cy={0}
                      r={SMALL_COUNTRY_FLASH_RADIUS_PX}
                      fill={flashMarkerColor}
                      fillOpacity={flashVisible ? 0.42 : 0.1}
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={SMALL_COUNTRY_FLASH_RADIUS_PX}
                      fill="transparent"
                      stroke={flashMarkerColor}
                      strokeWidth={3}
                      strokeOpacity={flashVisible ? 1 : 0.35}
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {(highlightCountryId || flashSmallCountryId) && (
          <g className="pacific-map-highlight" pointerEvents="none">
            {activePaths
              .filter(
                (country) =>
                  country.id === highlightCountryId ||
                  country.id === flashSmallCountryId
              )
              .map((country) => {
                // Circle-marker reveals flash red (same as the marker). Keep
                // landmass visible under the circle so the real shape pulses too.
                const isCircleRevealFlash = flashSmallCountryId === country.id;
                const highlightColor =
                  isCircleRevealFlash || highlightTone === "error"
                    ? WRONG_COUNTRY_COLOR
                    : highlightTone === "success"
                      ? SUBJECT_COUNTRY_COLOR
                      : highlightTone === "correct"
                        ? CORRECT_COUNTRY_COLOR
                        : TARGET_HIGHLIGHT_COLOR;
                const pulseOn = isCircleRevealFlash
                  ? flashVisible
                  : highlightVisible;
                const solidFill =
                  (highlightTone === "success" || highlightTone === "correct") &&
                  !isCircleRevealFlash;
                return (
                  <path
                    key={`highlight-${country.id}`}
                    d={country.path}
                    fill={highlightColor}
                    fillOpacity={
                      solidFill
                        ? 0.95
                        : pulseOn
                          ? 0.75
                          : 0.15
                    }
                    fillRule="evenodd"
                    stroke={
                      solidFill && highlightTone === "success"
                        ? SUBJECT_COUNTRY_OUTLINE
                        : solidFill
                          ? highlightColor
                          : "none"
                    }
                    strokeWidth={
                      solidFill && highlightTone === "success" ? 2 : solidFill ? 1.5 : 0
                    }
                  />
                );
              })}
          </g>
        )}
        {distanceOverlaySvg && (
          <g className="learn-distance" pointerEvents="none">
            <line
              x1={distanceOverlaySvg.from[0]}
              y1={distanceOverlaySvg.from[1]}
              x2={distanceOverlaySvg.to[0]}
              y2={distanceOverlaySvg.to[1]}
              stroke="#f8fafc"
              strokeWidth="2"
              strokeDasharray="8 6"
              strokeLinecap="round"
            />
            {!distanceFeedback?.hideFromMarker ? (
            <circle
              cx={distanceOverlaySvg.from[0]}
              cy={distanceOverlaySvg.from[1]}
              r="5"
              fill={WRONG_COUNTRY_COLOR}
              stroke="#ffffff"
              strokeWidth="2"
            />
            ) : null}
            {distanceOverlaySvg.label ? (
              <text
                x={(distanceOverlaySvg.from[0] + distanceOverlaySvg.to[0]) / 2}
                y={(distanceOverlaySvg.from[1] + distanceOverlaySvg.to[1]) / 2 - 8}
                fill="#f8fafc"
                stroke="#0f172a"
                strokeWidth="3"
                paintOrder="stroke"
                fontSize="13"
                fontWeight="700"
                textAnchor="middle"
              >
                {distanceOverlaySvg.label}
              </text>
            ) : null}
          </g>
        )}
      </svg>

      {mapNavigationEnabled ? (
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
      ) : (
        <div ref={mapControlsRef} className="hidden" />
      )}
    </div>
  );
}
