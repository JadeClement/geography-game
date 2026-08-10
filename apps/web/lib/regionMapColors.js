export const REGION_MAP_COLORS = {
  northAmerica: "#ab7436",
  southAmerica: "#358252",
  europe: "#8763c5",
  africa: "#b45050",
  asia: "#5073be",
  oceania: "#2c7771",
};

export const REGION_MAP_BORDER = "#ffffff";
export const REGION_MAP_OCEAN = "#2e7599";

export const REGION_MAP_LABELS = [
  { id: "northAmerica", label: "North America", shortLabel: "N. America", x: 128, y: 92 },
  { id: "southAmerica", label: "South America", shortLabel: "S. America", x: 172, y: 232 },
  { id: "europe", label: "Europe", shortLabel: "Europe", x: 388, y: 76 },
  { id: "africa", label: "Africa", shortLabel: "Africa", x: 398, y: 192 },
  { id: "asia", label: "Asia", shortLabel: "Asia", x: 572, y: 108 },
  { id: "oceania", label: "Oceania", shortLabel: "Oceania", x: 628, y: 248 },
];

export function getRegionMapColor(regionId) {
  return REGION_MAP_COLORS[regionId] ?? "#b3d1a1";
}
