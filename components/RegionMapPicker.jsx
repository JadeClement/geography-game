"use client";

import { useMemo } from "react";
import {
  GLOBE_MAP_HEIGHT,
  GLOBE_MAP_WIDTH,
  geometryToPathData,
} from "@/lib/globeProjection";
import {
  getRegionMapColor,
  REGION_MAP_BORDER,
  REGION_MAP_LABELS,
  REGION_MAP_OCEAN,
} from "@/lib/regionMapColors";

const PATH_SIMPLIFY_TOLERANCE = 0.25;

export default function RegionMapPicker({
  countries,
  selectedRegion,
  onSelect,
  disabled = false,
}) {
  const countryPaths = useMemo(() => {
    return countries
      .map((country) => {
        const path = geometryToPathData(
          country.feature.geometry,
          PATH_SIMPLIFY_TOLERANCE,
          GLOBE_MAP_WIDTH,
          GLOBE_MAP_HEIGHT
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
  }, [countries]);

  return (
    <div className={`region-map-picker ${disabled ? "region-map-picker--disabled" : ""}`}>
      <div className="region-map-wrap">
        <svg
          viewBox={`0 0 ${GLOBE_MAP_WIDTH} ${GLOBE_MAP_HEIGHT}`}
          className="region-map"
          role="group"
          aria-label="Choose a region on the map"
        >
          <rect
            width={GLOBE_MAP_WIDTH}
            height={GLOBE_MAP_HEIGHT}
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

        {REGION_MAP_LABELS.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={`choice-btn region-map-region-btn ${
              selectedRegion === zone.id ? "selected" : ""
            }`}
            style={{
              left: `${(zone.x / GLOBE_MAP_WIDTH) * 100}%`,
              top: `${(zone.y / GLOBE_MAP_HEIGHT) * 100}%`,
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
        ))}

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
