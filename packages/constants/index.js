/**
 * @worldly/constants — shared enums, thresholds, and static catalogs.
 * Plain JS so web and mobile can import without a build step.
 */

// ── Game types / modes / levels ──────────────────────────────────────────────

export const GAME_TYPES = {
  TEST: "test",
  LEARNING: "learning",
  DISCOVER: "discover",
};

export const GAME_MODES = {
  COUNTRIES: "countries",
  CAPITALS: "capitals",
  FLAGS: "flags",
};

export const REGIONS = [
  { id: "world", label: "World" },
  { id: "africa", label: "Africa" },
  { id: "asia", label: "Asia" },
  { id: "europe", label: "Europe" },
  { id: "northAmerica", label: "North America" },
  { id: "oceania", label: "Oceania" },
  { id: "southAmerica", label: "South America" },
];

export const GAME_LEVELS = {
  FIND_FILL: "F1",
  FIND_FLASH: "F2",
  NAME_FILL: "N1",
  NAME_FLASH: "N2",
};

export const LEVEL_CODES = Object.values(GAME_LEVELS);

export const LEVEL_SECTIONS = [
  {
    id: "find",
    title: "Find it",
    shortTitle: "Find",
    subtitle: "Given a country title, click the country on the map.",
    levels: [
      {
        level: GAME_LEVELS.FIND_FILL,
        title: "Level 1",
        description: "Map populates as you go",
      },
      {
        level: GAME_LEVELS.FIND_FLASH,
        title: "Level 2",
        description: "Map doesn't populate - countries disappear!",
      },
    ],
  },
  {
    id: "name",
    title: "Name it",
    shortTitle: "Name",
    subtitle: "Given a country on the map, type the country's name.",
    levels: [
      {
        level: GAME_LEVELS.NAME_FILL,
        title: "Level 1",
        description: "Map populates as you go",
      },
      {
        level: GAME_LEVELS.NAME_FLASH,
        title: "Level 2",
        description: "Map doesn't populate - countries disappear!",
      },
    ],
  },
];

/** Learn mode always records stats under F1 (matches web startNavigation). */
export const DEFAULT_LEARN_LEVEL = GAME_LEVELS.FIND_FILL;

export const COUNTRY_FLASH_MS = 1000;
export const WRONG_CLICK_FLASH_MS = 800;

export const ROUND_OUTCOMES = {
  FIRST_TRY_CORRECT: "first_try_correct",
  SECOND_TRY_CORRECT: "second_try_correct",
  NEEDED_REVEAL: "needed_reveal",
};

export const GAME_TYPE_FOR_STATS = {
  TEST: "test",
  LEARNING: "learning",
  REVIEW: "review",
};

// ── Mastery thresholds (exported; used by @worldly/core/mastery) ─────────────

export const MASTERY_GRADUATION_THRESHOLD = 0.9;
export const MASTERY_FAST_STREAK_REQUIRED = 3;
export const MASTERY_REENTRY_THRESHOLD = 0.75;
export const MASTERY_DECAY_HALF_LIFE_DAYS = 30;
export const MASTERY_MIN_WEIGHT = 0.05;

/** Fast first-try EMA step (was private MASTERY_EMA_FAST in web mastery.js). */
export const MASTERY_GRADUATION_FAST_CORRECT_DELTA = 0.2;
/** Slow first-try EMA step (was private MASTERY_EMA_SLOW). */
export const MASTERY_GRADUATION_SLOW_CORRECT_DELTA = 0.08;
export const MASTERY_SECOND_TRY_PENALTY = 0.15;
export const MASTERY_REVEAL_PENALTY = 0.35;

// ── % Worldly ────────────────────────────────────────────────────────────────

export const WORLDLY_WEIGHTS = {
  [GAME_MODES.COUNTRIES]: 0.5,
  [GAME_MODES.CAPITALS]: 0.35,
  [GAME_MODES.FLAGS]: 0.15,
};

export const LEVEL_WEIGHTS = {
  [GAME_LEVELS.FIND_FILL]: 0.15,
  [GAME_LEVELS.FIND_FLASH]: 0.25,
  [GAME_LEVELS.NAME_FILL]: 0.25,
  [GAME_LEVELS.NAME_FLASH]: 0.35,
};

export const WORLDLY_MILESTONES = [25, 50, 75, 90, 100];

// ── Learn question catalog ───────────────────────────────────────────────────

export const QUESTION_TIERS = {
  TIER_1: "tier_1",
  TIER_2: "tier_2",
  TIER_3: "tier_3",
  TIER_4: "tier_4",
};

export const LEARN_EMA_MULTIPLIERS = {
  tier_1_correct_fast: 1.0,
  tier_1_correct_slow: 1.0,
  tier_1_wrong: 1.0,
  tier_1_reveal: 1.0,
  tier_2_correct_fast: 0.6,
  tier_2_correct_slow: 0.6,
  tier_2_wrong: 0.5,
  tier_3_correct: 0.3,
  tier_3_wrong: 0.2,
  tier_4_correct: 0.15,
  tier_4_wrong: 0.1,
};

const ALL_CATEGORIES = ["countries", "capitals", "flags"];

export const QUESTION_TYPES = {
  BLANK_MAP_CLICK: {
    tier: QUESTION_TIERS.TIER_1,
    id: "blank_map_click",
    categories: ["countries"],
  },
  FREE_NAME_ENTRY: {
    tier: QUESTION_TIERS.TIER_1,
    id: "free_name_entry",
    categories: ["countries"],
  },
  CAPITAL_FREE_RECALL: {
    tier: QUESTION_TIERS.TIER_1,
    id: "capital_free_recall",
    categories: ["capitals"],
  },
  NEIGHBOR_RECALL_ALL: {
    tier: QUESTION_TIERS.TIER_1,
    id: "neighbor_recall_all",
    categories: ["countries"],
    requires: ["neighbors"],
  },
  NEIGHBOR_FREE_RECALL: {
    tier: QUESTION_TIERS.TIER_2,
    id: "neighbor_free_recall",
    categories: ["countries"],
    requires: ["neighbors"],
  },
  FLAG_IDENTIFICATION: {
    tier: QUESTION_TIERS.TIER_2,
    id: "flag_identification",
    categories: ["flags"],
  },
  CAPITAL_MATCHING: {
    tier: QUESTION_TIERS.TIER_2,
    id: "capital_matching",
    categories: ["capitals"],
  },
  NEIGHBOR_CONFIRM: {
    tier: QUESTION_TIERS.TIER_2,
    id: "neighbor_confirm",
    categories: ["countries"],
    requires: ["neighbors"],
  },
  NEIGHBOR_SELECT_ALL: {
    tier: QUESTION_TIERS.TIER_2,
    id: "neighbor_select_all",
    categories: ["countries"],
    requires: ["neighbors"],
  },
  POPULATION_COMPARE: {
    tier: QUESTION_TIERS.TIER_3,
    id: "population_compare",
    categories: ALL_CATEGORIES,
  },
  AREA_COMPARE: {
    tier: QUESTION_TIERS.TIER_3,
    id: "area_compare",
    categories: ALL_CATEGORIES,
  },
  NEIGHBOR_IDENTIFICATION: {
    tier: QUESTION_TIERS.TIER_3,
    id: "neighbor_identification",
    categories: ["countries"],
    requires: ["neighbors"],
  },
  BINARY_MAP_CHOICE: {
    tier: QUESTION_TIERS.TIER_4,
    id: "binary_map_choice",
    categories: ["countries"],
  },
  LANDLOCKED_CHECK: {
    tier: QUESTION_TIERS.TIER_4,
    id: "landlocked_check",
    categories: ALL_CATEGORIES,
  },
  LANGUAGE_FAMILY: {
    tier: QUESTION_TIERS.TIER_4,
    id: "language_family",
    categories: ALL_CATEGORIES,
    requires: ["languages"],
  },
  BRAZIL_NON_NEIGHBORS: {
    tier: QUESTION_TIERS.TIER_3,
    id: "brazil_non_neighbors",
    categories: ["countries"],
  },
};

export const MASTERY_BANDS = [
  { id: "new", min: 0, tiers: [QUESTION_TIERS.TIER_4] },
  { id: "developing", min: 0.3, tiers: [QUESTION_TIERS.TIER_3, QUESTION_TIERS.TIER_4] },
  { id: "proficient", min: 0.5, tiers: [QUESTION_TIERS.TIER_2, QUESTION_TIERS.TIER_3] },
  { id: "advanced", min: 0.7, tiers: [QUESTION_TIERS.TIER_1, QUESTION_TIERS.TIER_2] },
  { id: "mastered", min: 0.9, tiers: [QUESTION_TIERS.TIER_1] },
];

/** Display labels for Learn question types (from sessionSummary LEARN_TYPE_LABELS). */
export const TYPE_DISPLAY_NAMES = {
  blank_map_click: "Blank map",
  free_name_entry: "Name entry",
  capital_free_recall: "Capital recall",
  neighbor_recall_all: "All neighbors",
  neighbor_free_recall: "Neighbor recall",
  flag_identification: "Flag ID",
  capital_matching: "Capital match",
  neighbor_confirm: "Neighbor yes/no",
  neighbor_select_all: "Select neighbors",
  population_compare: "Population compare",
  area_compare: "Area compare",
  neighbor_identification: "Neighbor ID",
  binary_map_choice: "Map A/B",
  landlocked_check: "Landlocked?",
  language_family: "Language",
  brazil_non_neighbors: "Brazil non-neighbors",
};

/** Group question type ids by tier for UI filters. */
export const TYPE_GROUPS = {
  [QUESTION_TIERS.TIER_1]: [
    "blank_map_click",
    "free_name_entry",
    "capital_free_recall",
    "neighbor_recall_all",
  ],
  [QUESTION_TIERS.TIER_2]: [
    "neighbor_free_recall",
    "flag_identification",
    "capital_matching",
    "neighbor_confirm",
    "neighbor_select_all",
  ],
  [QUESTION_TIERS.TIER_3]: [
    "population_compare",
    "area_compare",
    "neighbor_identification",
    "brazil_non_neighbors",
  ],
  [QUESTION_TIERS.TIER_4]: [
    "binary_map_choice",
    "landlocked_check",
    "language_family",
  ],
};

/** Sequencer preference: weight for primary tier vs fallback within a band. */
export const LEARN_SESSION_WEIGHTS = {
  PRIMARY_TIER_WEIGHT: 0.7,
};

// ── Timing / geo / colors ────────────────────────────────────────────────────

export const MAX_ATTEMPTS = 2;
export const CORRECT_ROUND_DELAY_MS = 750;
export const REVEAL_ROUND_DELAY_MS = 500;
export const IDLE_PROMPT_MS = 2 * 60 * 1000;
export const IDLE_RETURN_MS = 60 * 60 * 1000;
export const GEOJSON_PATH = "/data/countries.geojson";

export const GEOJSON_ISO_OVERRIDES = {
  France: "FRA",
  Norway: "NOR",
  Kosovo: "XKX",
};

export const NAME_ALIASES = {
  "United States of America": "United States",
  "Russian Federation": "Russia",
  "Republic of Korea": "South Korea",
  "Korea, Republic of": "South Korea",
  "Dem. Rep. Korea": "North Korea",
  "Democratic People's Republic of Korea": "North Korea",
  "Iran (Islamic Republic of)": "Iran",
  "Lao People's Democratic Republic": "Laos",
  "Syrian Arab Republic": "Syria",
  "Viet Nam": "Vietnam",
  "Czech Republic": "Czechia",
  Türkiye: "Turkey",
  "Cabo Verde": "Cape Verde",
  Eswatini: "Swaziland",
  "Brunei Darussalam": "Brunei",
  "Timor-Leste": "East Timor",
  "Micronesia (Federated States of)": "Micronesia",
  "Saint Vincent and the Grenadines": "St. Vincent and the Grenadines",
  "Saint Kitts and Nevis": "St. Kitts and Nevis",
  "Saint Lucia": "St. Lucia",
  "São Tomé and Príncipe": "Sao Tome and Principe",
  "Côte d'Ivoire": "Ivory Coast",
};

export const ACTIVE_LAND_COLORS = {
  light: "#d1d5db",
  dark: "#475569",
};

export const ACTIVE_LAND_COLOR = ACTIVE_LAND_COLORS.dark;
export const WRONG_COUNTRY_COLOR = "#ff2222";
export const CORRECT_COUNTRY_COLOR = "#22c55e";
export const TARGET_HIGHLIGHT_COLOR = "#ffe600";
export const SUBJECT_COUNTRY_COLOR = "#ffffff";
export const SUBJECT_COUNTRY_OUTLINE = "#0f172a";

export const ISO2_OVERRIDES = {
  FRA: "FR",
  NOR: "NO",
  XKX: "XK",
  TWN: "TW",
};
