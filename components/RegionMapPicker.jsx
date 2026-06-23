"use client";

import { useMemo } from "react";
import { geometryToPathData, getRegionMapView } from "@/lib/globeProjection";
import {
  getRegionMapColor,
  REGION_MAP_BORDER,
  REGION_MAP_LABELS,
  REGION_MAP_OCEAN,
} from "@/lib/regionMapColors";
import { cn } from "@/lib/cn";
import { choiceBtn } from "@/lib/ui";

const PATH_SIMPLIFY_TOLERANCE = 0.25;

export default function RegionMapPicker({
  countries,
  selectedRegion,
  onSelect,
  disabled = false,
}) {
  const mapView = getRegionMapView("world");

  const countryPaths = useMemo(() => {
    return countries
      .map((country) => {
        const path = geometryToPathData(
          country.feature?.geometry,
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
  }, [countries, mapView]);

  return (
    <div className={cn("region-map-picker w-full", disabled && "region-map-picker--disabled")}>
      <div className="region-map-wrap">
        <svg
          viewBox={`0 0 ${mapView.width} ${mapView.height}`}
          className="region-map"
          role="group"
          aria-label="Choose a region on the map"
          preserveAspectRatio="xMidYMid meet"
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
                  style={{ fill: country.fill }}
                  fillRule="evenodd"
                  className={cn("region-map-country", selected && "selected")}
                  data-region={country.region}
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
            className={choiceBtn({
              selected: selectedRegion === zone.id,
              disabled,
              className: cn(
                "region-map-region-btn",
                "max-[40rem]:!px-1 max-[40rem]:!py-0.5 max-[40rem]:!text-[0.6875rem] max-[40rem]:!leading-tight max-[40rem]:rounded-sm max-[40rem]:!shadow-none",
                "bg-surface/10 backdrop-blur-sm",
                "enabled:hover:translate-x-[-50%] enabled:hover:translate-y-[-50%]",
                "enabled:active:translate-x-[-50%] enabled:active:translate-y-[-50%]",
              ),
            })}
            style={{
              left: `${(zone.x / mapView.width) * 100}%`,
              top: `${(zone.y / mapView.height) * 100}%`,
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
          className={choiceBtn({
            selected: selectedRegion === "world",
            disabled,
            className: cn(
              "region-map-world-btn absolute bottom-[5%] left-1/2 min-w-32 -translate-x-1/2 max-[40rem]:min-w-0",
              "max-[40rem]:!px-1 max-[40rem]:!py-0.5 max-[40rem]:!text-[0.6875rem] max-[40rem]:!leading-tight max-[40rem]:rounded-sm max-[40rem]:!shadow-none",
              "bg-surface/10 backdrop-blur-sm",
              "enabled:hover:-translate-x-1/2 enabled:active:-translate-x-1/2",
            ),
          })}
          disabled={disabled}
          onClick={() => onSelect("world")}
        >
          World
        </button>
      </div>
    </div>
  );
}
