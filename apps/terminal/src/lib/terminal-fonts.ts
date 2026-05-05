type TerminalFontSource = "fontsource" | "google" | "local";

export interface TerminalFont {
  id: string;
  name: string;
  family: string;
  source: TerminalFontSource;
  isLocal?: boolean;
}

const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const buildFamily = (primary: string): string => `"${primary}", ${MONO_FALLBACK}`;

const GEIST_MONO: TerminalFont = {
  id: "geist-mono",
  name: "Geist Mono",
  family: buildFamily("Geist Mono"),
  source: "fontsource",
};

const JETBRAINS_MONO: TerminalFont = {
  id: "jetbrains-mono",
  name: "JetBrains Mono",
  family: buildFamily("JetBrains Mono"),
  source: "google",
};

const FIRA_CODE: TerminalFont = {
  id: "fira-code",
  name: "Fira Code",
  family: buildFamily("Fira Code"),
  source: "google",
};

const IBM_PLEX_MONO: TerminalFont = {
  id: "ibm-plex-mono",
  name: "IBM Plex Mono",
  family: buildFamily("IBM Plex Mono"),
  source: "google",
};

const SOURCE_CODE_PRO: TerminalFont = {
  id: "source-code-pro",
  name: "Source Code Pro",
  family: buildFamily("Source Code Pro"),
  source: "google",
};

const ROBOTO_MONO: TerminalFont = {
  id: "roboto-mono",
  name: "Roboto Mono",
  family: buildFamily("Roboto Mono"),
  source: "google",
};

const DM_MONO: TerminalFont = {
  id: "dm-mono",
  name: "DM Mono",
  family: buildFamily("DM Mono"),
  source: "google",
};

const INCONSOLATA: TerminalFont = {
  id: "inconsolata",
  name: "Inconsolata",
  family: buildFamily("Inconsolata"),
  source: "google",
};

const SPACE_MONO: TerminalFont = {
  id: "space-mono",
  name: "Space Mono",
  family: buildFamily("Space Mono"),
  source: "google",
};

const UBUNTU_MONO: TerminalFont = {
  id: "ubuntu-mono",
  name: "Ubuntu Mono",
  family: buildFamily("Ubuntu Mono"),
  source: "google",
};

const ANONYMOUS_PRO: TerminalFont = {
  id: "anonymous-pro",
  name: "Anonymous Pro",
  family: buildFamily("Anonymous Pro"),
  source: "google",
};

export const LOCAL_FONT_ID = "local-font";

const LOCAL_FONT_PLACEHOLDER: TerminalFont = {
  id: LOCAL_FONT_ID,
  name: "Local Font",
  family: MONO_FALLBACK,
  source: "local",
  isLocal: true,
};

export const TERMINAL_FONTS: TerminalFont[] = [
  GEIST_MONO,
  ANONYMOUS_PRO,
  DM_MONO,
  FIRA_CODE,
  IBM_PLEX_MONO,
  INCONSOLATA,
  JETBRAINS_MONO,
  ROBOTO_MONO,
  SOURCE_CODE_PRO,
  SPACE_MONO,
  UBUNTU_MONO,
  LOCAL_FONT_PLACEHOLDER,
];

export const DEFAULT_TERMINAL_FONT_ID: string = GEIST_MONO.id;

export const isLocalFontId = (id: string | null | undefined): boolean => id === LOCAL_FONT_ID;

export const buildLocalFont = (rawFamily: string): TerminalFont => {
  const trimmed = rawFamily.trim();
  if (!trimmed) return LOCAL_FONT_PLACEHOLDER;
  return {
    id: LOCAL_FONT_ID,
    name: trimmed,
    family: buildFamily(trimmed),
    source: "local",
    isLocal: true,
  };
};

export const findTerminalFontById = (
  id: string | null | undefined,
  localFamily?: string,
): TerminalFont => {
  if (!id) return GEIST_MONO;
  if (isLocalFontId(id)) {
    return localFamily ? buildLocalFont(localFamily) : LOCAL_FONT_PLACEHOLDER;
  }
  return TERMINAL_FONTS.find((font) => font.id === id) ?? GEIST_MONO;
};

export const buildGoogleFontsStylesheetHref = (): string => {
  const googleFonts = TERMINAL_FONTS.filter((font) => font.source === "google");
  if (googleFonts.length === 0) return "";
  const familyParams = googleFonts
    .map((font) => `family=${font.name.replace(/ /g, "+")}:wght@400;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
};
