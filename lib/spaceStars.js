function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function buildStarShadow(count, seed, width, height) {
  const rand = seededRandom(seed);
  const parts = [];

  for (let i = 0; i < count; i += 1) {
    const x = Math.round(rand() * width);
    const y = Math.round(rand() * height);
    const alpha = 0.25 + rand() * 0.75;
    parts.push(`${x}px ${y}px rgba(255,255,255,${alpha.toFixed(2)})`);
  }

  return parts.join(", ");
}

const FIELD_WIDTH = 900;
const FIELD_HEIGHT = 1400;

export const SPACE_STAR_LAYERS = [
  {
    id: "far",
    shadow: buildStarShadow(120, 41003, FIELD_WIDTH, FIELD_HEIGHT),
    duration: 180,
  },
  {
    id: "mid",
    shadow: buildStarShadow(70, 90210, FIELD_WIDTH, FIELD_HEIGHT),
    duration: 120,
  },
  {
    id: "near",
    shadow: buildStarShadow(35, 133713, FIELD_WIDTH, FIELD_HEIGHT),
    duration: 75,
  },
];
