/**
 * Coastal water bodies for "X is not landlocked" teaching copy.
 * Names already include Ocean / Sea / Gulf so the subtitle can say
 * "It borders the Y ocean or Z sea".
 */

const ATLANTIC = "Atlantic Ocean";
const PACIFIC = "Pacific Ocean";
const INDIAN = "Indian Ocean";
const ARCTIC = "Arctic Ocean";
const MED = "Mediterranean Sea";
const CARIBBEAN = "Caribbean Sea";
const RED = "Red Sea";
const BLACK = "Black Sea";
const BALTIC = "Baltic Sea";
const NORTH = "North Sea";
const ADRIATIC = "Adriatic Sea";
const SOUTH_CHINA = "South China Sea";
const YELLOW = "Yellow Sea";
const JAPAN = "Sea of Japan";
const PERSIAN = "Persian Gulf";
const ARABIAN = "Arabian Sea";
const ANDAMAN = "Andaman Sea";
const TIMOR = "Timor Sea";
const GULF_OMAN = "Gulf of Oman";
const GULF_ADEN = "Gulf of Aden";
const GULF_THAILAND = "Gulf of Thailand";
const GULF_MEXICO = "Gulf of Mexico";

/** iso3 → water bodies, major ocean first, then distinctive seas. */
export const COUNTRY_COASTS = {
  ALB: [ADRIATIC],
  DZA: [MED],
  AGO: [ATLANTIC],
  ARG: [ATLANTIC],
  BGD: [INDIAN],
  BEL: [NORTH],
  BLZ: [CARIBBEAN],
  BEN: [ATLANTIC],
  BIH: [ADRIATIC],
  BRA: [ATLANTIC],
  BRN: [SOUTH_CHINA],
  BGR: [BLACK],
  KHM: [GULF_THAILAND],
  CMR: [ATLANTIC],
  CAN: [ATLANTIC, PACIFIC, ARCTIC],
  CHL: [PACIFIC],
  CHN: [PACIFIC, SOUTH_CHINA, YELLOW],
  COL: [PACIFIC, CARIBBEAN],
  CRI: [PACIFIC, CARIBBEAN],
  HRV: [ADRIATIC],
  COD: [ATLANTIC],
  DNK: [NORTH, BALTIC],
  DJI: [RED, GULF_ADEN],
  DOM: [ATLANTIC, CARIBBEAN],
  TLS: [TIMOR],
  ECU: [PACIFIC],
  EGY: [MED, RED],
  SLV: [PACIFIC],
  GNQ: [ATLANTIC],
  ERI: [RED],
  EST: [BALTIC],
  FIN: [BALTIC],
  FRA: [ATLANTIC, MED],
  GAB: [ATLANTIC],
  GMB: [ATLANTIC],
  GEO: [BLACK],
  DEU: [NORTH, BALTIC],
  GHA: [ATLANTIC],
  GRC: [MED],
  GTM: [PACIFIC, CARIBBEAN],
  GIN: [ATLANTIC],
  GNB: [ATLANTIC],
  GUY: [ATLANTIC],
  HTI: [ATLANTIC, CARIBBEAN],
  HND: [PACIFIC, CARIBBEAN],
  IND: [INDIAN],
  IDN: [INDIAN, PACIFIC],
  IRN: [PERSIAN, GULF_OMAN],
  IRQ: [PERSIAN],
  IRL: [ATLANTIC],
  ISR: [MED, RED],
  ITA: [MED],
  CIV: [ATLANTIC],
  JOR: [RED],
  KEN: [INDIAN],
  KWT: [PERSIAN],
  LVA: [BALTIC],
  LBN: [MED],
  LBR: [ATLANTIC],
  LBY: [MED],
  LTU: [BALTIC],
  MYS: [SOUTH_CHINA, ANDAMAN],
  MRT: [ATLANTIC],
  MEX: [PACIFIC, GULF_MEXICO, CARIBBEAN],
  MCO: [MED],
  MNE: [ADRIATIC],
  MAR: [ATLANTIC, MED],
  MOZ: [INDIAN],
  MMR: [ANDAMAN],
  NAM: [ATLANTIC],
  NLD: [NORTH],
  NIC: [PACIFIC, CARIBBEAN],
  NGA: [ATLANTIC],
  PRK: [YELLOW, JAPAN],
  NOR: [ATLANTIC, ARCTIC],
  OMN: [ARABIAN, GULF_OMAN],
  PAK: [ARABIAN],
  PSE: [MED],
  PAN: [PACIFIC, CARIBBEAN],
  PNG: [PACIFIC],
  PER: [PACIFIC],
  POL: [BALTIC],
  PRT: [ATLANTIC],
  QAT: [PERSIAN],
  COG: [ATLANTIC],
  ROU: [BLACK],
  RUS: [ARCTIC, PACIFIC, BALTIC, BLACK],
  SAU: [RED, PERSIAN],
  SEN: [ATLANTIC],
  SLE: [ATLANTIC],
  SVN: [ADRIATIC],
  SOM: [INDIAN],
  ZAF: [ATLANTIC, INDIAN],
  KOR: [YELLOW, JAPAN],
  ESP: [ATLANTIC, MED],
  LKA: [INDIAN],
  SDN: [RED],
  SUR: [ATLANTIC],
  SWE: [BALTIC, NORTH],
  SYR: [MED],
  THA: [ANDAMAN, GULF_THAILAND],
  TGO: [ATLANTIC],
  TUN: [MED],
  TUR: [MED, BLACK],
  UKR: [BLACK],
  ARE: [PERSIAN, GULF_OMAN],
  GBR: [ATLANTIC, NORTH],
  TZA: [INDIAN],
  USA: [ATLANTIC, PACIFIC, ARCTIC],
  URY: [ATLANTIC],
  VEN: [ATLANTIC, CARIBBEAN],
  VNM: [SOUTH_CHINA],
  YEM: [RED, GULF_ADEN],
};

function formatWaterList(names) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * @param {string | null | undefined} countryId iso3
 * @returns {string | null}
 */
export function formatCoastlineSubtitle(countryId) {
  if (!countryId) return null;
  const coasts = COUNTRY_COASTS[countryId];
  if (!coasts?.length) return null;
  const withArticle = coasts.map((name) => `the ${name}`);
  return `It borders ${formatWaterList(withArticle)}.`;
}
