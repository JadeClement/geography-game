export const MOBILE_MEDIA_QUERY = "(max-width: 48rem)";

export function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}
