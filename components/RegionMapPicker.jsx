"use client";

import { useMemo } from "react";
import {
  geometryToPathData,
  getRegionMapView,
  OCEANIA_MAP_HEIGHT,
  OCEANIA_MAP_WIDTH,
} from "@/lib/globeProjection";
import {
  getRegionMapColor,
  REGION_MAP_BORDER,
  REGION_MAP_LABELS,
  REGION_MAP_OCEAN,
  getRegionMapLabelPosition,
} from "@/lib/regionMapColors";

const PATH_SIMPLIFY_TOLERANCE = 0.25;

export default function RegionMapPicker({
  countries,
  selectedRegion,
  onSelect,
  disabled = false,
}) {
  const isOceaniaFocus = selectedRegion === "oceania";
  const mapView = getRegionMapView(isOceaniaFocus ? "oceania" : "world");

  const countryPaths = useMemo(() => {
    const visibleCountries = isOceaniaFocus
      ? countries.filter((country) => country.region === "oceania")
      : countries;

    return visibleCountries
      .map((country) => {
        const path = geometryToPathData(
          country.feature.geometry,
          PATH_SIMPLIFY_TOLERANCE,
          mapView
        );
        if (!path) return null;
        return {
          id: country.id,
          region: country.region,
          path,
          fill: getRegionMapColor(country.region),
        };
      })
      .filter(Boolean);
  }, [countries, isOceaniaFocus, mapView]);

  const visibleLabels = isOceaniaFocus
    ? REGION_MAP_LABELS.filter((zone) => zone.id === "oceania")
    : REGION_MAP_LABELS;

  return (
    <div className={`region-map-picker ${disabled ? "region-map-picker--disabled" : ""}`}>
      <div className="region-map-wrap">
        <svg
          viewBox={`0 0 ${mapView.width} ${mapView.height}`}
          className={`region-map ${isOceaniaFocus ? "region-map--oceania-focus" : ""}`}
          role="group"
          aria-label="Choose a region on the map"
        >
          <rect
            width={mapView.width}
            height={mapView.height}
            className="region-map-ocean"
            fill={REGION_MAP_OCEAN}
            aria-hidden="true"
          />

          <g
            className="region-map-countries"
            stroke={REGION_MAP_BORDER}
            strokeWidth="0.35"
            strokeLinejoin="round"
          >
            {countryPaths.map((country) => {
              const selected = selectedRegion === country.region;
              return (
                <path
                  key={country.id}
                  d={country.path}
                  fill={country.fill}
                  fillRule="evenodd"
                  className={`region-map-country ${selected ? "selected" : ""}`}
                  data-region={country.region}
                  aria-hidden="true"
                  onClick={() => {
                    if (!disabled) onSelect(country.region);
                  }}
                />
              );
            })}
          </g>
        </svg>

        {visibleLabels.map((zone) => {
          const { x, y } = getRegionMapLabelPosition(zone.id, isOceaniaFocus);
          const mapWidth = isOceaniaFocus ? OCEANIA_MAP_WIDTH : mapView.width;
          const mapHeight = isOceaniaFocus ? OCEANIA_MAP_HEIGHT : mapView.height;

          return (
            <button
              key={zone.id}
              type="button"
              className={`choice-btn region-map-region-btn ${
                selectedRegion === zone.id ? "selected" : ""
              }`}
              style={{
                left: `${(x / mapWidth) * 100}%`,
                top: `${(y / mapHeight) * 100}%`,
              }}
              disabled={disabled}
              onClick={() => onSelect(zone.id)}
            >
              <span className="region-map-region-btn-label region-map-region-btn-label--full">
                {zone.label}
              </span>
              <span className="region-map-region-btn-label region-map-region-btn-label--short">
                {zone.shortLabel}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          className={`choice-btn region-map-world-btn ${selectedRegion === "world" ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => onSelect("world")}
        >
          World
        </button>
      </div>
    </div>
  );
}
