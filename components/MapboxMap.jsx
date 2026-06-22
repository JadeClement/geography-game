"use client";

import { useEffect, useRef } from "react";
import { mapContainer } from "@/lib/ui";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "@/components/ThemeProvider";
import {
  ACTIVE_LAND_COLOR,
  CORRECT_COUNTRY_COLOR,
  TARGET_HIGHLIGHT_COLOR,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import {
  CIRCLE_CLICK_RADIUS_PX,
  MIN_CLICK_TARGET_PX,
} from "@/lib/geometry";
import { GAME_LEVELS, isProgressiveFillLevel } from "@/lib/levels";
import { THEMES } from "@/lib/theme";

const MAP_THEME_COLORS = {
  [THEMES.LIGHT]: {
    countryFill: "#59a348",
    countryBorder: "#478a39",
    inactiveLand: "#f7f3eb",
    inactiveBorder: "#e5ddd0",
    ocean: "#bae6fd",
    smallCountryStroke: "#1e293b",
    levelBorder: "#334155",
  },
  [THEMES.DARK]: {
    countryFill: "#1e3a5f",
    countryBorder: "#94a3b8",
    inactiveLand: "#334155",
    inactiveBorder: "#475569",
    ocean: null,
    smallCountryStroke: "#ffffff",
    levelBorder: "#e2e8f0",
  },
};

function getMapThemeColors(theme) {
  return MAP_THEME_COLORS[theme] ?? MAP_THEME_COLORS[THEMES.DARK];
}

function getLevelFillColorExpression(level) {
  if (level === GAME_LEVELS.FIND_FILL) {
    return [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "flashWrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "filled"], true],
      ["coalesce", ["get", "assignedColor"], ACTIVE_LAND_COLOR],
      ACTIVE_LAND_COLOR,
    ];
  }

  if (level === GAME_LEVELS.NAME_FILL) {
    return [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "filled"], true],
      CORRECT_COUNTRY_COLOR,
      ["==", ["feature-state", "target"], true],
      TARGET_HIGHLIGHT_COLOR,
      ACTIVE_LAND_COLOR,
    ];
  }

  return [
    "case",
    ["==", ["feature-state", "wrong"], true],
    WRONG_COUNTRY_COLOR,
    ["==", ["feature-state", "showColor"], true],
    ["coalesce", ["get", "assignedColor"], ACTIVE_LAND_COLOR],
    ACTIVE_LAND_COLOR,
  ];
}

function getScreenSizePx(map, { minLng, minLat, maxLng, maxLat }) {
  const nw = map.project([minLng, maxLat]);
  const se = map.project([maxLng, minLat]);
  return Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y));
}

function updateSmallCountryCircles(map, smallCountriesGeojson) {
  if (!map.getSource("small-countries") || !smallCountriesGeojson?.features?.length) {
    return;
  }

  for (const feature of smallCountriesGeojson.features) {
    const { id, minLng, minLat, maxLng, maxLat } = feature.properties;
    const screenSize = getScreenSizePx(map, { minLng, minLat, maxLng, maxLat });
    const show = screenSize < MIN_CLICK_TARGET_PX;

    map.setFeatureState(
      { source: "small-countries", id },
      {
        opacity: show ? 1 : 0,
        radius: show ? CIRCLE_CLICK_RADIUS_PX : 0,
      }
    );
  }
}

function isCircleClickTarget(map, circleFeature) {
  const id = circleFeature.properties.id;
  const state = map.getFeatureState({ source: "small-countries", id });
  return (state?.opacity ?? 0) > 0;
}

function getSmallCircleStrokeColorExpression(level, defaultStrokeColor) {
  if (!isProgressiveFillLevel(level)) {
    return defaultStrokeColor;
  }

  if (level === GAME_LEVELS.FIND_FILL) {
    return [
      "case",
      ["==", ["feature-state", "flashWrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "filled"], true],
      ["coalesce", ["get", "assignedColor"], ACTIVE_LAND_COLOR],
      defaultStrokeColor,
    ];
  }

  return [
    "case",
    ["==", ["feature-state", "wrong"], true],
    WRONG_COUNTRY_COLOR,
    ["==", ["feature-state", "filled"], true],
    CORRECT_COUNTRY_COLOR,
    defaultStrokeColor,
  ];
}

function addSmallCountryLayers(map, smallCountriesGeojson, strokeColor, level) {
  if (!smallCountriesGeojson?.features?.length) return;

  if (!map.getSource("small-countries")) {
    map.addSource("small-countries", {
      type: "geojson",
      data: smallCountriesGeojson,
      promoteId: "id",
    });

    map.addLayer({
      id: "small-country-circles",
      type: "circle",
      source: "small-countries",
      paint: {
        "circle-radius": ["coalesce", ["feature-state", "radius"], 0],
        "circle-color": "transparent",
        "circle-stroke-color": getSmallCircleStrokeColorExpression(level, strokeColor),
        "circle-stroke-width": 2,
        "circle-stroke-opacity": ["coalesce", ["feature-state", "opacity"], 0],
      },
    });

    map.addLayer({
      id: "small-country-flash",
      type: "circle",
      source: "small-countries",
      paint: {
        "circle-radius": [
          "+",
          ["coalesce", ["feature-state", "radius"], 0],
          1,
        ],
        "circle-color": "transparent",
        "circle-stroke-color": "#ef4444",
        "circle-stroke-width": 3,
        "circle-stroke-opacity": 0.9,
      },
      filter: ["==", ["get", "id"], ""],
    });
  } else {
    map.getSource("small-countries").setData(smallCountriesGeojson);
  }

  updateSmallCountryCircles(map, smallCountriesGeojson);
}

function pickClickedFeature(map, features) {
  const circleFeature = features.find((f) => f.layer.id === "small-country-circles");
  const fillFeature = features.find((f) => f.layer.id === "country-fill");

  if (circleFeature && fillFeature && !isCircleClickTarget(map, circleFeature)) {
    return fillFeature;
  }

  return circleFeature ?? fillFeature ?? features[0];
}

function applyMapView(map, mapView) {
  if (!mapView) return;

  const runFit = () => {
    map.resize();

    if (mapView.type === "camera") {
      map.jumpTo({
        center: mapView.center,
        zoom: mapView.zoom,
        padding: mapView.padding ?? 48,
        duration: 0,
      });
      return;
    }

    map.fitBounds(mapView.bounds, {
      padding: mapView.padding ?? 48,
      duration: 0,
      maxZoom: mapView.maxZoom ?? 5,
    });
  };

  if (map.isStyleLoaded() && map.loaded()) {
    map.once("idle", runFit);
  } else {
    map.once("load", () => map.once("idle", runFit));
  }
}

function configureBaseStyle(map, theme) {
  const colors = getMapThemeColors(theme);
  const layers = map.getStyle()?.layers ?? [];

  for (const layer of layers) {
    const { id, type } = layer;

    if (type === "symbol") {
      map.setLayoutProperty(id, "visibility", "none");
      continue;
    }

    if (type === "line" && (id.includes("admin-1") || id.includes("admin-2"))) {
      map.setLayoutProperty(id, "visibility", "none");
      continue;
    }

    if (colors.ocean) {
      if (type === "background") {
        map.setPaintProperty(id, "background-color", colors.ocean);
      } else if (type === "fill" && id.includes("water")) {
        map.setPaintProperty(id, "fill-color", colors.ocean);
      }
    }
  }
}

function addCountryLayers(map, geojson, inactiveGeojson, mapColors, level) {
  if (map.getSource("inactive-countries")) {
    map.getSource("inactive-countries").setData(inactiveGeojson);
  } else {
    map.addSource("inactive-countries", {
      type: "geojson",
      data: inactiveGeojson,
    });

    map.addLayer({
      id: "inactive-country-fill",
      type: "fill",
      source: "inactive-countries",
      paint: {
        "fill-color": mapColors.inactiveLand,
        "fill-opacity": 1,
        "fill-outline-color": mapColors.inactiveBorder,
      },
    });
  }

  if (map.getSource("countries")) {
    map.getSource("countries").setData(geojson);
    if (map.getLayer("country-fill")) {
      map.setPaintProperty("country-fill", "fill-color", getLevelFillColorExpression(level));
    }
    return;
  }

  map.addSource("countries", {
    type: "geojson",
    data: geojson,
    promoteId: "id",
  });

  map.addLayer({
    id: "country-fill",
    type: "fill",
    source: "countries",
    paint: {
      "fill-color": getLevelFillColorExpression(level),
      "fill-opacity": 0.92,
      "fill-outline-color": mapColors.levelBorder,
    },
  });

  map.addLayer({
    id: "country-target-outline",
    type: "line",
    source: "countries",
    paint: {
      "line-color": mapColors.levelBorder,
      "line-width": 3,
      "line-opacity": 0.95,
    },
    filter: ["==", ["get", "id"], ""],
  });

  map.addLayer({
    id: "country-highlight",
    type: "fill",
    source: "countries",
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.75,
    },
    filter: ["==", ["get", "id"], ""],
  });

  map.addLayer({
    id: "country-borders",
    type: "line",
    source: "countries",
    paint: {
      "line-color": mapColors.levelBorder,
      "line-width": 0.5,
    },
  });
}

function syncSmallCountryFeatureStates(
  map,
  smallCountriesGeojson,
  { wrongCountryIds, flashWrongCountryIds, filledCountryIds }
) {
  if (!map.getSource("small-countries") || !smallCountriesGeojson?.features?.length) {
    return;
  }

  const wrongSet = new Set(wrongCountryIds);
  const flashWrongSet = new Set(flashWrongCountryIds);
  const filledSet = new Set(filledCountryIds);

  for (const feature of smallCountriesGeojson.features) {
    const id = feature.properties.id;
    map.setFeatureState(
      { source: "small-countries", id },
      {
        wrong: wrongSet.has(id),
        flashWrong: flashWrongSet.has(id),
        filled: filledSet.has(id),
      }
    );
  }
}

function syncCountryFeatureStates(
  map,
  geojson,
  {
    wrongCountryIds,
    flashWrongCountryIds,
    showColorCountryIds,
    filledCountryIds,
    highlightTargetCountryId,
  }
) {
  if (!map.getSource("countries") || !geojson?.features?.length) return;

  const wrongSet = new Set(wrongCountryIds);
  const flashWrongSet = new Set(flashWrongCountryIds);
  const showColorSet = new Set(showColorCountryIds);
  const filledSet = new Set(filledCountryIds);

  for (const feature of geojson.features) {
    const id = feature.properties.id;
    map.setFeatureState(
      { source: "countries", id },
      {
        wrong: wrongSet.has(id),
        flashWrong: flashWrongSet.has(id),
        showColor: showColorSet.has(id),
        filled: filledSet.has(id),
        target: id === highlightTargetCountryId,
      }
    );
  }
}

export default function MapboxMap({
  geojson,
  inactiveGeojson,
  smallCountriesGeojson,
  gameActive,
  level,
  wrongCountryIds,
  flashWrongCountryIds,
  showColorCountryIds,
  filledCountryIds,
  highlightTargetCountryId,
  highlightCountryId,
  flashSmallCountryId,
  mapView,
  onCountryClick,
}) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const fillFlashIntervalRef = useRef(null);
  const circleFlashIntervalRef = useRef(null);
  const onCountryClickRef = useRef(onCountryClick);
  const gameActiveRef = useRef(gameActive);
  const smallCountriesGeojsonRef = useRef(smallCountriesGeojson);

  onCountryClickRef.current = onCountryClick;
  gameActiveRef.current = gameActive;
  smallCountriesGeojsonRef.current = smallCountriesGeojson;

  useEffect(() => {
    if (!containerRef.current || !geojson) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;

    const mapStyle =
      theme === THEMES.LIGHT
        ? "mapbox://styles/mapbox/light-v11"
        : "mapbox://styles/mapbox/dark-v11";
    const mapColors = getMapThemeColors(theme);
    const initialCenter =
      mapView?.type === "camera" ? mapView.center : [10, 20];
    const initialZoom = mapView?.type === "camera" ? mapView.zoom : 1.2;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      projection: "naturalEarth",
    });

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    const handleClick = (event) => {
      if (!gameActiveRef.current) return;

      const layers = map.getLayer("small-country-circles")
        ? ["country-fill", "small-country-circles"]
        : ["country-fill"];

      const features = map.queryRenderedFeatures(event.point, { layers });
      if (features.length === 0) return;

      onCountryClickRef.current(pickClickedFeature(map, features));
    };

    const setCirclePointerCursor = (event) => {
      const feature = event.features?.[0];
      if (feature && isCircleClickTarget(map, feature)) {
        map.getCanvas().style.cursor = "pointer";
      }
    };

    const setPointerCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointerCursor = () => {
      map.getCanvas().style.cursor = "";
    };

    const handleResize = () => {
      map.resize();
      updateSmallCountryCircles(map, smallCountriesGeojsonRef.current);
    };

    const handleViewChangeForCircles = () => {
      updateSmallCountryCircles(map, smallCountriesGeojsonRef.current);
    };

    map.on("load", () => {
      configureBaseStyle(map, theme);
      addCountryLayers(map, geojson, inactiveGeojson, mapColors, level);

      if (smallCountriesGeojson?.features?.length) {
        addSmallCountryLayers(map, smallCountriesGeojson, mapColors.smallCountryStroke, level);
      }

      map.on("zoom", handleViewChangeForCircles);
      map.on("moveend", handleViewChangeForCircles);

      map.on("click", handleClick);
      map.on("mouseenter", "country-fill", setPointerCursor);
      map.on("mouseleave", "country-fill", clearPointerCursor);
      map.on("mouseenter", "small-country-circles", setCirclePointerCursor);
      map.on("mouseleave", "small-country-circles", clearPointerCursor);

      if (mapView) {
        applyMapView(map, mapView);
        map.once("idle", handleViewChangeForCircles);
      } else {
        handleViewChangeForCircles();
      }

      map.resize();
    });

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      map.off("zoom", handleViewChangeForCircles);
      map.off("moveend", handleViewChangeForCircles);
      if (fillFlashIntervalRef.current) {
        clearInterval(fillFlashIntervalRef.current);
      }
      if (circleFlashIntervalRef.current) {
        clearInterval(circleFlashIntervalRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
  }, [geojson, inactiveGeojson, smallCountriesGeojson, mapView, theme, level]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getSource("countries")) return;

    const mapColors = getMapThemeColors(theme);

    addCountryLayers(map, geojson, inactiveGeojson, mapColors, level);

    if (map.getLayer("inactive-country-fill")) {
      map.setPaintProperty("inactive-country-fill", "fill-color", mapColors.inactiveLand);
      map.setPaintProperty(
        "inactive-country-fill",
        "fill-outline-color",
        mapColors.inactiveBorder
      );
    }

    if (map.getLayer("country-fill")) {
      map.setPaintProperty("country-fill", "fill-color", getLevelFillColorExpression(level));
      map.setPaintProperty("country-fill", "fill-outline-color", mapColors.levelBorder);
      map.setPaintProperty("country-borders", "line-color", mapColors.levelBorder);
    }

    if (map.getLayer("small-country-circles")) {
      map.setPaintProperty(
        "small-country-circles",
        "circle-stroke-color",
        getSmallCircleStrokeColorExpression(level, mapColors.smallCountryStroke)
      );
    }

    if (smallCountriesGeojson?.features?.length) {
      addSmallCountryLayers(map, smallCountriesGeojson, mapColors.smallCountryStroke, level);
    } else if (map.getSource("small-countries")) {
      map.getSource("small-countries").setData({
        type: "FeatureCollection",
        features: [],
      });
    }

    if (mapView) {
      applyMapView(map, mapView);
      map.once("idle", () => {
        updateSmallCountryCircles(map, smallCountriesGeojson);
      });
    } else {
      updateSmallCountryCircles(map, smallCountriesGeojson);
    }
  }, [geojson, inactiveGeojson, smallCountriesGeojson, mapView, theme, level]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const runSync = () => {
      if (!map.getSource("countries")) return;
      syncCountryFeatureStates(map, geojson, {
        wrongCountryIds,
        flashWrongCountryIds,
        showColorCountryIds,
        filledCountryIds,
        highlightTargetCountryId,
      });
      syncSmallCountryFeatureStates(map, smallCountriesGeojson, {
        wrongCountryIds,
        flashWrongCountryIds,
        filledCountryIds,
      });
    };

    if (map.isStyleLoaded()) {
      runSync();
    } else {
      map.once("load", runSync);
    }
  }, [
    geojson,
    smallCountriesGeojson,
    wrongCountryIds,
    flashWrongCountryIds,
    showColorCountryIds,
    filledCountryIds,
    highlightTargetCountryId,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("country-highlight")) return;

    if (fillFlashIntervalRef.current) {
      clearInterval(fillFlashIntervalRef.current);
      fillFlashIntervalRef.current = null;
    }

    if (!highlightCountryId) {
      map.setFilter("country-highlight", ["==", ["get", "id"], ""]);
      return;
    }

    map.setFilter("country-highlight", [
      "==",
      ["get", "id"],
      highlightCountryId,
    ]);

    let visible = true;
    fillFlashIntervalRef.current = setInterval(() => {
      if (!mapRef.current?.getLayer("country-highlight")) return;
      visible = !visible;
      map.setPaintProperty(
        "country-highlight",
        "fill-opacity",
        visible ? 0.75 : 0.15
      );
    }, 450);

    return () => {
      if (fillFlashIntervalRef.current) {
        clearInterval(fillFlashIntervalRef.current);
        fillFlashIntervalRef.current = null;
      }
    };
  }, [highlightCountryId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("small-country-flash")) return;

    if (circleFlashIntervalRef.current) {
      clearInterval(circleFlashIntervalRef.current);
      circleFlashIntervalRef.current = null;
    }

    if (!flashSmallCountryId) {
      map.setFilter("small-country-flash", ["==", ["get", "id"], ""]);
      return;
    }

    map.setFilter("small-country-flash", [
      "==",
      ["get", "id"],
      flashSmallCountryId,
    ]);

    let visible = true;
    const updateFlashOpacity = () => {
      if (!mapRef.current?.getLayer("small-country-flash")) return;
      const state = map.getFeatureState({
        source: "small-countries",
        id: flashSmallCountryId,
      });
      const show = (state?.opacity ?? 0) > 0;
      map.setPaintProperty(
        "small-country-flash",
        "circle-stroke-opacity",
        show ? (visible ? 0.95 : 0.15) : 0
      );
    };

    updateFlashOpacity();
    circleFlashIntervalRef.current = setInterval(() => {
      visible = !visible;
      updateFlashOpacity();
    }, 450);

    map.on("zoom", updateFlashOpacity);
    map.on("moveend", updateFlashOpacity);

    return () => {
      map.off("zoom", updateFlashOpacity);
      map.off("moveend", updateFlashOpacity);
      if (circleFlashIntervalRef.current) {
        clearInterval(circleFlashIntervalRef.current);
        circleFlashIntervalRef.current = null;
      }
    };
  }, [flashSmallCountryId, smallCountriesGeojson]);

  return <div ref={containerRef} className={mapContainer} />;
}
