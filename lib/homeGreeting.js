const STORAGE_KEY = "worldly-home-greeting";

/** Time-of-day greeting from the user's local clock. */
export function getTimeOfDayGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Prefer first name; fall back to username. */
export function getGreetingName(user) {
  const fullName = user?.name?.trim();
  if (fullName) return fullName.split(/\s+/)[0];
  const username = user?.username?.trim();
  if (username) return username;
  return null;
}

const GREETING_VARIANTS = [
  (timeGreeting, name) =>
    `${timeGreeting}, ${name} — where in the world will you go today?`,
  (_timeGreeting, name) => `Hi ${name}. Where in the world will you go today?`,
  (timeGreeting, name) => `${timeGreeting}, ${name}. Ready to explore?`,
  (_timeGreeting, name) => `Where in the world today, ${name}?`,
];

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Rotate through greeting variants once per local calendar day.
 * Stable within a day so remounts don't flicker; advances on the next day.
 */
export function getGreetingVariantIndex(variantCount, date = new Date()) {
  const today = dayKey(date);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.dayKey === today && Number.isInteger(parsed.index)) {
      return ((parsed.index % variantCount) + variantCount) % variantCount;
    }
    const prevIndex = Number.isInteger(parsed?.index) ? parsed.index : -1;
    const index = (prevIndex + 1) % variantCount;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ dayKey: today, index }));
    return index;
  } catch {
    const start = new Date(date.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((date - start) / 86_400_000);
    return ((dayOfYear % variantCount) + variantCount) % variantCount;
  }
}

export function buildHomeGreeting(user, date = new Date()) {
  const name = getGreetingName(user);
  if (!name) return null;

  const timeGreeting = getTimeOfDayGreeting(date);
  const index = getGreetingVariantIndex(GREETING_VARIANTS.length, date);
  return GREETING_VARIANTS[index](timeGreeting, name);
}
