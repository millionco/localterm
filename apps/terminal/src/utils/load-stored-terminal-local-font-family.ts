import {
  TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH,
  TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY,
} from "@/lib/constants";

export const loadStoredTerminalLocalFontFamily = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY);
    if (!stored) return "";
    return stored.trim().slice(0, TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH);
  } catch {
    return "";
  }
};
