import {
  ACTIVE_LAND_COLOR,
  CORRECT_COUNTRY_COLOR,
  TARGET_HIGHLIGHT_COLOR,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import { GAME_LEVELS } from "@/lib/levels";

export function getPacificCountryFill({
  countryId,
  level,
  assignedColor,
  wrongCountryIds,
  flashWrongCountryIds,
  showColorCountryIds,
  filledCountryIds,
  highlightTargetCountryId,
  isActive,
}) {
  const isWrong = wrongCountryIds.includes(countryId);
  const isFlashWrong = flashWrongCountryIds.includes(countryId);
  const isFilled = filledCountryIds.includes(countryId);
  const showColor = showColorCountryIds.includes(countryId);
  const isTarget = highlightTargetCountryId === countryId;

  if (!isActive) {
    return null;
  }

  if (level === GAME_LEVELS.FIND_FILL) {
    if (isWrong || isFlashWrong) return WRONG_COUNTRY_COLOR;
    if (isFilled) return assignedColor ?? ACTIVE_LAND_COLOR;
    return ACTIVE_LAND_COLOR;
  }

  if (level === GAME_LEVELS.NAME_FILL) {
    if (isWrong) return WRONG_COUNTRY_COLOR;
    if (isFilled) return CORRECT_COUNTRY_COLOR;
    if (isTarget) return TARGET_HIGHLIGHT_COLOR;
    return ACTIVE_LAND_COLOR;
  }

  if (isWrong || isFlashWrong) return WRONG_COUNTRY_COLOR;
  if (showColor) return assignedColor ?? ACTIVE_LAND_COLOR;
  return ACTIVE_LAND_COLOR;
}

export function shouldShowPacificCircle(country) {
  return Boolean(country.isSmall);
}
