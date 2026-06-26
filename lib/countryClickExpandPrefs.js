export const COUNTRY_CLICK_EXPAND_STORAGE_KEY = "geography-country-click-expand";
export const DEFAULT_COUNTRY_CLICK_EXPAND = true;

const COUNTRY_CLICK_EXPAND_EVENT = "geography:country-click-expand-change";

export function getCountryClickExpandEnabled() {
  if (typeof window === "undefined") return DEFAULT_COUNTRY_CLICK_EXPAND;
  try {
    const raw = window.localStorage.getItem(COUNTRY_CLICK_EXPAND_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_COUNTRY_CLICK_EXPAND;
    return raw === "true";
  } catch {
    return DEFAULT_COUNTRY_CLICK_EXPAND;
  }
}

export function setCountryClickExpandEnabled(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COUNTRY_CLICK_EXPAND_STORAGE_KEY,
      enabled ? "true" : "false"
    );
    dispatchCountryClickExpandChange();
  } catch {
    // ignore quota / private mode
  }
}

export function dispatchCountryClickExpandChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COUNTRY_CLICK_EXPAND_EVENT));
}

export function subscribeCountryClickExpand(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(COUNTRY_CLICK_EXPAND_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(COUNTRY_CLICK_EXPAND_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
