interface LocalFontDataEntry {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

interface QueryLocalFontsCapableWindow {
  queryLocalFonts?: () => Promise<LocalFontDataEntry[]>;
}

export const isLocalFontsApiSupported = (): boolean => {
  if (typeof window === "undefined") return false;
  return typeof (window as QueryLocalFontsCapableWindow).queryLocalFonts === "function";
};

export const queryLocalFontFamilies = async (): Promise<string[]> => {
  if (typeof window === "undefined") return [];
  const capableWindow = window as QueryLocalFontsCapableWindow;
  if (!capableWindow.queryLocalFonts) return [];
  const entries = await capableWindow.queryLocalFonts();
  const families = new Set<string>();
  for (const entry of entries) {
    if (entry.family) families.add(entry.family);
  }
  return Array.from(families).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
};
