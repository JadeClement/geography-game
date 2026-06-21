/** GeoJSON uses -99 for some entries; map iso3 to usable alpha-2 codes. */
export const ISO2_OVERRIDES = {
  FRA: "FR",
  NOR: "NO",
  XKX: "XK",
};

export function resolveIso2(iso3, rawIso2) {
  if (iso3 && ISO2_OVERRIDES[iso3]) {
    return ISO2_OVERRIDES[iso3];
  }

  if (typeof rawIso2 === "string" && /^[A-Za-z]{2}$/.test(rawIso2) && rawIso2 !== "-99") {
    return rawIso2.toUpperCase();
  }

  return null;
}

/** flagcdn.com only serves certain widths (e.g. w160, w320, w640). */
const FLAGCDN_WIDTHS = [160, 320, 640];

function snapFlagWidth(width) {
  return FLAGCDN_WIDTHS.find((size) => size >= width) ?? FLAGCDN_WIDTHS[FLAGCDN_WIDTHS.length - 1];
}

export function getFlagUrl(iso2, width = 160) {
  if (!iso2) return null;
  const snapped = snapFlagWidth(width);
  return `https://flagcdn.com/w${snapped}/${iso2.toLowerCase()}.png`;
}
