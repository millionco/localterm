import {
  TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH,
  TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY,
} from "@/lib/constants";

export const storeTerminalLocalFontFamily = (rawFamily: string): void => {
  if (typeof window === "undefined") return;
  const trimmed = rawFamily.trim().slice(0, TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH);
  try {
    if (!trimmed) {
      window.localStorage.removeItem(TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY, trimmed);
  } catch {
    /* localStorage unavailable; selection still applies in-session */
  }
};
