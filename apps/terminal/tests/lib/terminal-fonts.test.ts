import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_TERMINAL_FONT_ID,
  LOCAL_FONT_ID,
  TERMINAL_FONTS,
  buildGoogleFontsStylesheetHref,
  buildLocalFont,
  findTerminalFontById,
  isLocalFontId,
} from "../../src/lib/terminal-fonts";

describe("terminal-fonts registry", () => {
  it("ships with several distinct monospace fonts", () => {
    expect(TERMINAL_FONTS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(TERMINAL_FONTS.map((font) => font.id));
    expect(ids.size).toBe(TERMINAL_FONTS.length);
  });

  it("exposes the default font id and it resolves to a real font", () => {
    const font = findTerminalFontById(DEFAULT_TERMINAL_FONT_ID);
    expect(font.id).toBe(DEFAULT_TERMINAL_FONT_ID);
  });

  it("falls back to the default font for null, undefined, or unknown ids", () => {
    expect(findTerminalFontById(null).id).toBe(DEFAULT_TERMINAL_FONT_ID);
    expect(findTerminalFontById(undefined).id).toBe(DEFAULT_TERMINAL_FONT_ID);
    expect(findTerminalFontById("not-a-real-font").id).toBe(DEFAULT_TERMINAL_FONT_ID);
  });

  it.each(TERMINAL_FONTS.map((font) => [font.id, font] as const))(
    "%s declares a CSS family with monospace fallback",
    (_id, font) => {
      expect(font.family.length).toBeGreaterThan(0);
      expect(font.family).toContain("monospace");
    },
  );

  it("builds a single Google Fonts stylesheet URL containing every google-sourced family", () => {
    const href = buildGoogleFontsStylesheetHref();
    expect(href.startsWith("https://fonts.googleapis.com/css2?")).toBe(true);
    const googleFonts = TERMINAL_FONTS.filter((font) => font.source === "google");
    for (const font of googleFonts) {
      expect(href).toContain(font.name.replace(/ /g, "+"));
    }
  });

  it("does not inject local-source families into the Google Fonts stylesheet URL", () => {
    const href = buildGoogleFontsStylesheetHref();
    const localFonts = TERMINAL_FONTS.filter((font) => font.source === "local");
    expect(localFonts.length).toBeGreaterThan(0);
    for (const font of localFonts) {
      expect(href).not.toContain(font.name.replace(/ /g, "+"));
    }
  });

  it("includes a single local-font slot flagged as isLocal", () => {
    const localSlots = TERMINAL_FONTS.filter((font) => font.isLocal);
    expect(localSlots.length).toBe(1);
    expect(localSlots[0].id).toBe(LOCAL_FONT_ID);
    expect(localSlots[0].source).toBe("local");
  });
});

describe("local font handling", () => {
  it("isLocalFontId only matches the reserved id", () => {
    expect(isLocalFontId(LOCAL_FONT_ID)).toBe(true);
    expect(isLocalFontId("geist-mono")).toBe(false);
    expect(isLocalFontId(null)).toBe(false);
    expect(isLocalFontId(undefined)).toBe(false);
  });

  it("findTerminalFontById with local id and family returns a synthesized font", () => {
    const font = findTerminalFontById(LOCAL_FONT_ID, "Comic Code");
    expect(font.id).toBe(LOCAL_FONT_ID);
    expect(font.name).toBe("Comic Code");
    expect(font.family).toContain('"Comic Code"');
    expect(font.family).toContain("monospace");
    expect(font.source).toBe("local");
    expect(font.isLocal).toBe(true);
  });

  it("findTerminalFontById with local id but blank family falls back to placeholder", () => {
    const font = findTerminalFontById(LOCAL_FONT_ID, "   ");
    expect(font.id).toBe(LOCAL_FONT_ID);
    expect(font.isLocal).toBe(true);
    expect(font.name).toBe("Local Font");
  });

  it("buildLocalFont trims whitespace before quoting the family", () => {
    const font = buildLocalFont("  Operator Mono  ");
    expect(font.name).toBe("Operator Mono");
    expect(font.family.startsWith('"Operator Mono"')).toBe(true);
  });
});
