"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

function hideMapLabels(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type === "symbol") {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

export default function MapboxMap({
  geojson,
  smallCountriesGeojson,
  gameActive,
  highlightCountryId,
  flashSmallCountryId,
  fitBounds,
  onCountryClick,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const fillFlashIntervalRef = useRef(null);
  const circleFlashIntervalRef = useRef(null);
  const onCountryClickRef = useRef(onCountryClick);
  const gameActiveRef = useRef(gameActive);

  onCountryClickRef.current = onCountryClick;
  gameActiveRef.current = gameActive;

  useEffect(() => {
    if (!containerRef.current || !geojson) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [10, 20],
      zoom: 1.2,
      projection: "naturalEarth",
    });

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    const clickableLayers = ["small-country-circles", "country-fill"];

    const handleClick = (event) => {
      if (!gameActiveRef.current) return;

      const features = map.queryRenderedFeatures(event.point, {
        layers: clickableLayers,
      });
      if (features.length === 0) return;

      const feature =
        features.find((f) => f.layer.id === "small-country-circles") ??
        features[0];

      onCountryClickRef.current(feature);
    };

    const setPointerCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointerCursor = () => {
      map.getCanvas().style.cursor = "";
    };

    const handleResize = () => map.resize();

    map.on("load", () => {
      hideMapLabels(map);

      map.addSource("countries", {
        type: "geojson",
        data: geojson,
        generateId: true,
      });

      map.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": "#1e3a5f",
          "fill-opacity": 0.6,
          "fill-outline-color": "#64748b",
        },
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
          "line-color": "#94a3b8",
          "line-width": 0.5,
        },
      });

      if (smallCountriesGeojson?.features?.length) {
        map.addSource("small-countries", {
          type: "geojson",
          data: smallCountriesGeojson,
        });

        map.addLayer({
          id: "small-country-circles",
          type: "circle",
          source: "small-countries",
          paint: {
            "circle-radius": 6,
            "circle-color": "transparent",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "small-country-flash",
          type: "circle",
          source: "small-countries",
          paint: {
            "circle-radius": 7,
            "circle-color": "transparent",
            "circle-stroke-color": "#ef4444",
            "circle-stroke-width": 3,
            "circle-stroke-opacity": 0.9,
          },
          filter: ["==", ["get", "id"], ""],
        });
      }

      map.on("click", handleClick);
      map.on("mouseenter", "country-fill", setPointerCursor);
      map.on("mouseleave", "country-fill", clearPointerCursor);
      map.on("mouseenter", "small-country-circles", setPointerCursor);
      map.on("mouseleave", "small-country-circles", clearPointerCursor);

      if (fitBounds) {
        map.fitBounds(fitBounds, { padding: 48, duration: 0 });
      }

      map.resize();
    });

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (fillFlashIntervalRef.current) {
        clearInterval(fillFlashIntervalRef.current);
      }
      if (circleFlashIntervalRef.current) {
        clearInterval(circleFlashIntervalRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
  }, [geojson, smallCountriesGeojson, fitBounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getSource("countries")) return;

    map.getSource("countries").setData(geojson);

    if (map.getSource("small-countries")) {
      map.getSource("small-countries").setData(
        smallCountriesGeojson ?? { type: "FeatureCollection", features: [] }
      );
    }

    if (fitBounds) {
      map.fitBounds(fitBounds, { padding: 48, duration: 800 });
    }
  }, [geojson, smallCountriesGeojson, fitBounds]);

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
    circleFlashIntervalRef.current = setInterval(() => {
      if (!mapRef.current?.getLayer("small-country-flash")) return;
      visible = !visible;
      map.setPaintProperty(
        "small-country-flash",
        "circle-stroke-opacity",
        visible ? 0.95 : 0.15
      );
    }, 450);

    return () => {
      if (circleFlashIntervalRef.current) {
        clearInterval(circleFlashIntervalRef.current);
        circleFlashIntervalRef.current = null;
      }
    };
  }, [flashSmallCountryId]);

  return <div ref={containerRef} className="map-container" />;
}
