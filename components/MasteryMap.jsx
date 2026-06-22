"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ALL_MODE, TIER_COLORS } from "@/lib/masteryMap";

const OCEAN = "#070d1c";
const BASE_LAND = "#1a2740";
const BASE_BORDER = "#2b3c5c";

function configureStyle(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    const { id, type } = layer;
    if (type === "symbol") {
      map.setLayoutProperty(id, "visibility", "none");
    } else if (type === "line" && (id.includes("admin-1") || id.includes("admin-2"))) {
      map.setLayoutProperty(id, "visibility", "none");
    } else if (type === "background") {
      map.setPaintProperty(id, "background-color", OCEAN);
    } else if (type === "fill" && id.includes("water")) {
      map.setPaintProperty(id, "fill-color", OCEAN);
    }
  }
}

function singleFillOpacity() {
  return [
    "case",
    ["==", ["feature-state", "lit"], true],
    [
      "interpolate",
      ["linear"],
      ["coalesce", ["feature-state", "score"], 0],
      0, 0,
      0.2, 0.22,
      0.6, 0.55,
      1, 0.95,
    ],
    0,
  ];
}

function singleLineOpacity() {
  return [
    "case",
    [
      "all",
      ["==", ["feature-state", "lit"], true],
      [">=", ["coalesce", ["feature-state", "score"], 0], 0.85],
    ],
    0.85,
    0,
  ];
}

function tierFillColor() {
  return [
    "match",
    ["coalesce", ["feature-state", "tier"], 0],
    1, TIER_COLORS[1],
    2, TIER_COLORS[2],
    3, TIER_COLORS[3],
    "rgba(0,0,0,0)",
  ];
}

function tierFillOpacity() {
  return [
    "case",
    [
      "all",
      ["==", ["feature-state", "lit"], true],
      [">", ["coalesce", ["feature-state", "tier"], 0], 0],
    ],
    ["match", ["coalesce", ["feature-state", "tier"], 0], 3, 0.95, 2, 0.82, 1, 0.6, 0],
    0,
  ];
}

function tierLineOpacity() {
  return [
    "case",
    [
      "all",
      ["==", ["feature-state", "lit"], true],
      [">=", ["coalesce", ["feature-state", "tier"], 0], 3],
    ],
    0.95,
    0,
  ];
}

function applyModePaint(map, mode, accent) {
  if (!map.getLayer("mastery-glow")) return;

  if (mode === ALL_MODE) {
    map.setPaintProperty("mastery-glow", "fill-color", tierFillColor());
    map.setPaintProperty("mastery-glow", "fill-opacity", tierFillOpacity());
    map.setPaintProperty("mastery-glow-line", "line-color", TIER_COLORS[3]);
    map.setPaintProperty("mastery-glow-line", "line-opacity", tierLineOpacity());
  } else {
    map.setPaintProperty("mastery-glow", "fill-color", accent);
    map.setPaintProperty("mastery-glow", "fill-opacity", singleFillOpacity());
    map.setPaintProperty("mastery-glow-line", "line-color", accent);
    map.setPaintProperty("mastery-glow-line", "line-opacity", singleLineOpacity());
  }
}

function applyValues(map, geojson, scoreByCountry, tierByCountry) {
  for (const feature of geojson.features) {
    const id = feature.properties?.id;
    if (!id) continue;
    map.setFeatureState(
      { source: "mastery", id },
      {
        score: scoreByCountry?.get(id) ?? 0,
        tier: tierByCountry?.get(id) ?? 0,
        lit: false,
      }
    );
  }
}

export default forwardRef(function MasteryMap(
  { countries, geojson, mode, accent, scoreByCountry, tierByCountry, onHover },
  ref
) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const igniteRafRef = useRef(null);
  const onHoverRef = useRef(onHover);
  const propsRef = useRef({ mode, accent, scoreByCountry, tierByCountry });

  onHoverRef.current = onHover;
  propsRef.current = { mode, accent, scoreByCountry, tierByCountry };

  const orderedIds = useRef([]);
  orderedIds.current = [...countries]
    .sort((a, b) => (a.centroid?.[0] ?? 0) - (b.centroid?.[0] ?? 0))
    .map((c) => c.id);

  const runIgnite = () => {
    const map = mapRef.current;
    if (!map) return;
    if (igniteRafRef.current) cancelAnimationFrame(igniteRafRef.current);

    const ids = orderedIds.current;
    for (const id of ids) {
      map.setFeatureState({ source: "mastery", id }, { lit: false });
    }

    let i = 0;
    const batch = Math.max(1, Math.ceil(ids.length / 42));
    const step = () => {
      for (let k = 0; k < batch && i < ids.length; k += 1, i += 1) {
        map.setFeatureState({ source: "mastery", id: ids[i] }, { lit: true });
      }
      if (i < ids.length) {
        igniteRafRef.current = requestAnimationFrame(step);
      }
    };
    step();
  };

  const applyAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const { mode: m, accent: a, scoreByCountry: s, tierByCountry: t } = propsRef.current;
    applyValues(map, geojson, s, t);
    applyModePaint(map, m, a);
    runIgnite();
  };

  useImperativeHandle(ref, () => ({
    exportImage({ title, stat, accent: brandAccent }) {
      const map = mapRef.current;
      if (!map) return;
      const src = map.getCanvas();
      const w = src.width;
      const h = src.height;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d");
      ctx.drawImage(src, 0, 0);

      const band = Math.round(h * 0.24);
      const grad = ctx.createLinearGradient(0, 0, 0, band);
      grad.addColorStop(0, "rgba(3, 7, 18, 0.9)");
      grad.addColorStop(1, "rgba(3, 7, 18, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, band);

      const pad = Math.round(w * 0.04);
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.round(h * 0.052)}px system-ui, sans-serif`;
      ctx.fillText(title, pad, pad);
      ctx.fillStyle = brandAccent || "#fcd34d";
      ctx.font = `600 ${Math.round(h * 0.036)}px system-ui, sans-serif`;
      ctx.fillText(stat, pad, pad + Math.round(h * 0.064));

      ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
      ctx.font = `600 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText("Worldly", w - pad, h - pad - Math.round(h * 0.034));
      ctx.textAlign = "left";

      out.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mastery-map-${(title || "geography").toLowerCase().replace(/\s+/g, "-")}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    },
  }));

  useEffect(() => {
    if (!containerRef.current || !geojson) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [12, 28],
      zoom: 1.1,
      projection: "naturalEarth",
      attributionControl: false,
      preserveDrawingBuffer: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    mapRef.current = map;

    const handleMove = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      onHoverRef.current?.({ id: feature.properties?.id, point: event.point });
      map.getCanvas().style.cursor = "default";
    };
    const handleLeave = () => {
      onHoverRef.current?.(null);
      map.getCanvas().style.cursor = "";
    };

    map.on("load", () => {
      configureStyle(map);

      map.addSource("mastery", { type: "geojson", data: geojson, promoteId: "id" });

      map.addLayer({
        id: "mastery-base",
        type: "fill",
        source: "mastery",
        paint: {
          "fill-color": BASE_LAND,
          "fill-opacity": 1,
          "fill-outline-color": BASE_BORDER,
        },
      });

      map.addLayer({
        id: "mastery-glow",
        type: "fill",
        source: "mastery",
        paint: {
          "fill-color": accent,
          "fill-opacity": 0,
        },
      });

      map.addLayer({
        id: "mastery-glow-line",
        type: "line",
        source: "mastery",
        paint: {
          "line-color": accent,
          "line-width": 2.2,
          "line-blur": 6,
          "line-opacity": 0,
        },
      });

      map.addLayer({
        id: "mastery-border",
        type: "line",
        source: "mastery",
        paint: {
          "line-color": BASE_BORDER,
          "line-width": 0.4,
          "line-opacity": 0.5,
        },
      });

      map.on("mousemove", "mastery-base", handleMove);
      map.on("mouseleave", "mastery-base", handleLeave);

      readyRef.current = true;
      applyAll();
      map.resize();
    });

    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (igniteRafRef.current) cancelAnimationFrame(igniteRafRef.current);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson]);

  useEffect(() => {
    if (!readyRef.current) return;
    applyAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, accent, scoreByCountry, tierByCountry]);

  return <div ref={containerRef} className="mastery-map-canvas" />;
});
