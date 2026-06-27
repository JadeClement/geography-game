import { stripDiacritics } from "./constants";

export function normalizeCapital(value) {
  return stripDiacritics(String(value ?? "").trim().toLowerCase());
}

export function getCapitalAlternates(country) {
  return Array.isArray(country?.capitalAlternates) ? country.capitalAlternates : [];
}

/** Primary quiz capital plus any contested alternates. */
export function getAcceptedCapitals(country) {
  const primary = country?.capital?.trim();
  const alternates = getCapitalAlternates(country).map((capital) => capital.trim()).filter(Boolean);
  if (!primary) return alternates;

  const seen = new Set();
  return [primary, ...alternates].filter((capital) => {
    const key = normalizeCapital(capital);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatCapitalReference(country) {
  return getAcceptedCapitals(country).join(" · ");
}

export function isCorrectCapitalAnswer(input, country) {
  const normalizedInput = normalizeCapital(input);
  if (!normalizedInput) return false;

  return getAcceptedCapitals(country).some(
    (capital) => normalizeCapital(capital) === normalizedInput
  );
}

export function getQuizCapital(country) {
  return country?.capital?.trim() ?? "";
}
