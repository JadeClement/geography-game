import {
  ACTIVE_LAND_COLOR,
  CORRECT_COUNTRY_COLOR,
  SUBJECT_COUNTRY_COLOR,
  TARGET_HIGHLIGHT_COLOR,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import { MIN_CLICK_TARGET_PX, shouldUseSmallCountryCircle } from "@/lib/geometry";
import { GAME_LEVELS } from "@/lib/levels";

/** Match Mapbox feature-state highlightKind values. */
function highlightFillColor(tone) {
  if (tone === "error") return WRONG_COUNTRY_COLOR;
  if (tone === "success") return SUBJECT_COUNTRY_COLOR;
  if (tone === "correct") return CORRECT_COUNTRY_COLOR;
  return TARGET_HIGHLIGHT_COLOR;
}

export function getPacificCountryFill({
  countryId,
  level,
  assignedColor,
  wrongCountryIds,
  flashWrongCountryIds,
  showColorCountryIds,
  filledCountryIdSet,
  highlightTargetCountryId,
  highlightCountryId = null,
  highlightTone = "prompt",
  targetFlashOn = true,
  isActive,
  activeLandColor = ACTIVE_LAND_COLOR,
}) {
  const isWrong = wrongCountryIds.includes(countryId);
  const isFlashWrong = flashWrongCountryIds.includes(countryId);
  const isFilled = filledCountryIdSet.has(countryId);
  const showColor = showColorCountryIds.includes(countryId);
  const isTarget = highlightTargetCountryId === countryId;
  const isHighlighted = highlightCountryId === countryId;

  if (!isActive) {
    return null;
  }

  if (level === GAME_LEVELS.FIND_FILL) {
    if (isWrong || isFlashWrong) return WRONG_COUNTRY_COLOR;
    if (isHighlighted) return highlightFillColor(highlightTone);
    if (isFilled) return assignedColor ?? activeLandColor;
    if (showColor) return assignedColor ?? activeLandColor;
    return activeLandColor;
  }

  if (level === GAME_LEVELS.NAME_FILL) {
    if (isWrong) return WRONG_COUNTRY_COLOR;
    if (isHighlighted) return highlightFillColor(highlightTone);
    if (isFilled) return CORRECT_COUNTRY_COLOR;
    if (isTarget) return targetFlashOn ? TARGET_HIGHLIGHT_COLOR : activeLandColor;
    return activeLandColor;
  }

  if (isWrong || isFlashWrong) return WRONG_COUNTRY_COLOR;
  if (isHighlighted) return highlightFillColor(highlightTone);
  if (showColor) return assignedColor ?? activeLandColor;
  return activeLandColor;
}

export function shouldShowPacificCircle(country, screenSizePx) {
  return shouldUseSmallCountryCircle(country.isSmall, screenSizePx ?? MIN_CLICK_TARGET_PX);
}
