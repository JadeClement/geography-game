export const REGION_MAP_COLORS = {
  northAmerica: "#d97706",
  southAmerica: "#16a34a",
  europe: "#7c3aed",
  africa: "#dc2626",
  asia: "#2563eb",
  oceania: "#0d9488",
};

export const REGION_MAP_BORDER = "#ffffff";
export const REGION_MAP_OCEAN = "#0284c7";

export const REGION_MAP_LABELS = [
  { id: "northAmerica", label: "North America", shortLabel: "N. America", x: 128, y: 92 },
  { id: "southAmerica", label: "South America", shortLabel: "S. America", x: 172, y: 232 },
  { id: "europe", label: "Europe", shortLabel: "Europe", x: 388, y: 76 },
  { id: "africa", label: "Africa", shortLabel: "Africa", x: 398, y: 192 },
  { id: "asia", label: "Asia", shortLabel: "Asia", x: 572, y: 108 },
  { id: "oceania", label: "Oceania", shortLabel: "Oceania", x: 628, y: 248 },
];

const OCEANIA_FOCUS_LABEL_POSITIONS = {
  oceania: { x: 108, y: 188 },
};

export function getRegionMapLabelPosition(regionId, isOceaniaFocus) {
  if (isOceaniaFocus) {
    return OCEANIA_FOCUS_LABEL_POSITIONS[regionId] ?? OCEANIA_FOCUS_LABEL_POSITIONS.oceania;
  }

  const zone = REGION_MAP_LABELS.find((entry) => entry.id === regionId);
  return zone ? { x: zone.x, y: zone.y } : { x: 0, y: 0 };
}

export function getRegionMapColor(regionId) {
  return REGION_MAP_COLORS[regionId] ?? "#b3d1a1";
}
