import { GAME_MODES } from "@/lib/regions";

export function getDiscoverInstructionText(mode) {
  if (mode === GAME_MODES.CAPITALS) return "Tap a country to see its capital.";
  if (mode === GAME_MODES.FLAGS) return "Tap a country to see its flag.";
  return "Tap a country to see its name.";
}

export function getDiscoverLabelContent(country, mode) {
  if (mode === GAME_MODES.CAPITALS) {
    return { kind: "text", text: country.capital };
  }
  if (mode === GAME_MODES.FLAGS) {
    return { kind: "flag", text: country.name, iso2: country.iso2 };
  }
  return { kind: "text", text: country.name };
}
