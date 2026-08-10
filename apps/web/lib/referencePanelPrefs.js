import { isMobileViewport } from "@/lib/viewport";

const STORAGE_KEY = "geography.referencePanelDefaultOpen";

export function getReferencePanelDefaultOpen() {
  if (typeof window === "undefined") return false;
  if (isMobileViewport()) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setReferencePanelDefaultOpen(open) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "true" : "false");
  } catch {
    // ignore quota / private mode
  }
}
