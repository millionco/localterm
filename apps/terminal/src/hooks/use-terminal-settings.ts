import { useCallback, useMemo, useRef, useState } from "react";
import type { TerminalCursorStyle } from "@/lib/terminal-cursor";
import { findTerminalFontById } from "@/lib/terminal-fonts";
import type { TerminalFont } from "@/lib/terminal-fonts";
import { findTerminalThemeById } from "@/lib/terminal-themes";
import type { TerminalTheme } from "@/lib/terminal-themes";
import { clampTerminalFontSize } from "@/utils/clamp-terminal-font-size";
import { clampTerminalLineHeight } from "@/utils/clamp-terminal-line-height";
import { loadStoredTerminalCursorBlink } from "@/utils/load-stored-terminal-cursor-blink";
import { loadStoredTerminalCursorStyle } from "@/utils/load-stored-terminal-cursor-style";
import { loadStoredTerminalFontId } from "@/utils/load-stored-terminal-font-id";
import { loadStoredTerminalFontSize } from "@/utils/load-stored-terminal-font-size";
import { loadStoredTerminalLineHeight } from "@/utils/load-stored-terminal-line-height";
import { loadStoredTerminalScrollback } from "@/utils/load-stored-terminal-scrollback";
import { loadStoredTerminalScrollOnUserInput } from "@/utils/load-stored-terminal-scroll-on-user-input";
import { loadStoredTerminalThemeId } from "@/utils/load-stored-terminal-theme-id";
import { storeTerminalCursorBlink } from "@/utils/store-terminal-cursor-blink";
import { storeTerminalCursorStyle } from "@/utils/store-terminal-cursor-style";
import { storeTerminalFontId } from "@/utils/store-terminal-font-id";
import { storeTerminalFontSize } from "@/utils/store-terminal-font-size";
import { storeTerminalLineHeight } from "@/utils/store-terminal-line-height";
import { storeTerminalScrollback } from "@/utils/store-terminal-scrollback";
import { storeTerminalScrollOnUserInput } from "@/utils/store-terminal-scroll-on-user-input";
import { storeTerminalThemeId } from "@/utils/store-terminal-theme-id";

export interface UseTerminalSettingsReturn {
  initialThemeId: string;
  initialFontId: string;
  initialFontSize: number;
  initialLineHeight: number;
  initialCursorStyle: TerminalCursorStyle;
  initialCursorBlink: boolean;
  initialScrollback: number;
  initialScrollOnUserInput: boolean;
  initialFont: TerminalFont;
  effectiveTheme: TerminalTheme;
  effectiveFont: TerminalFont;
  effectiveCursorStyle: TerminalCursorStyle;
  activeThemeId: string;
  activeFontId: string;
  activeFontSize: number;
  activeLineHeight: number;
  activeCursorStyle: TerminalCursorStyle;
  activeCursorBlink: boolean;
  activeScrollback: number;
  activeScrollOnUserInput: boolean;
  handleThemeChange: (themeId: string) => void;
  setPreviewThemeId: (themeId: string | null) => void;
  handleFontChange: (fontId: string) => void;
  setPreviewFontId: (fontId: string | null) => void;
  handleFontSizeChange: (fontSize: number) => void;
  handleLineHeightChange: (lineHeight: number) => void;
  handleCursorStyleChange: (style: TerminalCursorStyle) => void;
  setPreviewCursorStyle: (style: TerminalCursorStyle | null) => void;
  handleCursorBlinkChange: (blink: boolean) => void;
  handleScrollbackChange: (scrollback: number) => void;
  handleScrollOnUserInputChange: (scrollOnUserInput: boolean) => void;
}

export const useTerminalSettings = (): UseTerminalSettingsReturn => {
  const initialThemeIdRef = useRef(loadStoredTerminalThemeId());
  const initialFontIdRef = useRef(loadStoredTerminalFontId());
  const initialFontSizeRef = useRef(loadStoredTerminalFontSize());
  const initialLineHeightRef = useRef(loadStoredTerminalLineHeight());
  const initialCursorStyleRef = useRef(loadStoredTerminalCursorStyle());
  const initialCursorBlinkRef = useRef(loadStoredTerminalCursorBlink());
  const initialScrollbackRef = useRef(loadStoredTerminalScrollback());
  const initialScrollOnUserInputRef = useRef(loadStoredTerminalScrollOnUserInput());
  const initialFontRef = useRef(findTerminalFontById(initialFontIdRef.current));

  const [activeThemeId, setActiveThemeId] = useState(initialThemeIdRef.current);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const effectiveThemeId = previewThemeId ?? activeThemeId;
  const effectiveTheme = useMemo(() => findTerminalThemeById(effectiveThemeId), [effectiveThemeId]);

  const [activeFontId, setActiveFontId] = useState(initialFontIdRef.current);
  const [previewFontId, setPreviewFontId] = useState<string | null>(null);
  const effectiveFontId = previewFontId ?? activeFontId;
  const effectiveFont = useMemo(() => findTerminalFontById(effectiveFontId), [effectiveFontId]);

  const [activeFontSize, setActiveFontSize] = useState(initialFontSizeRef.current);
  const [activeLineHeight, setActiveLineHeight] = useState(initialLineHeightRef.current);

  const [activeCursorStyle, setActiveCursorStyle] = useState<TerminalCursorStyle>(
    initialCursorStyleRef.current,
  );
  const [previewCursorStyle, setPreviewCursorStyle] = useState<TerminalCursorStyle | null>(null);
  const effectiveCursorStyle = previewCursorStyle ?? activeCursorStyle;

  const [activeCursorBlink, setActiveCursorBlink] = useState(initialCursorBlinkRef.current);
  const [activeScrollback, setActiveScrollback] = useState(initialScrollbackRef.current);
  const [activeScrollOnUserInput, setActiveScrollOnUserInput] = useState(
    initialScrollOnUserInputRef.current,
  );

  const handleThemeChange = useCallback((nextThemeId: string) => {
    setActiveThemeId(nextThemeId);
    setPreviewThemeId(null);
    storeTerminalThemeId(nextThemeId);
  }, []);

  const handleFontChange = useCallback((nextFontId: string) => {
    setActiveFontId(nextFontId);
    setPreviewFontId(null);
    storeTerminalFontId(nextFontId);
  }, []);

  const handleFontSizeChange = useCallback((nextFontSize: number) => {
    const clamped = clampTerminalFontSize(nextFontSize);
    setActiveFontSize(clamped);
    storeTerminalFontSize(clamped);
  }, []);

  const handleLineHeightChange = useCallback((nextLineHeight: number) => {
    const clamped = clampTerminalLineHeight(nextLineHeight);
    setActiveLineHeight(clamped);
    storeTerminalLineHeight(clamped);
  }, []);

  const handleCursorStyleChange = useCallback((nextCursorStyle: TerminalCursorStyle) => {
    setActiveCursorStyle(nextCursorStyle);
    setPreviewCursorStyle(null);
    storeTerminalCursorStyle(nextCursorStyle);
  }, []);

  const handleCursorBlinkChange = useCallback((nextCursorBlink: boolean) => {
    setActiveCursorBlink(nextCursorBlink);
    storeTerminalCursorBlink(nextCursorBlink);
  }, []);

  const handleScrollbackChange = useCallback((nextScrollback: number) => {
    setActiveScrollback(nextScrollback);
    storeTerminalScrollback(nextScrollback);
  }, []);

  const handleScrollOnUserInputChange = useCallback((nextScrollOnUserInput: boolean) => {
    setActiveScrollOnUserInput(nextScrollOnUserInput);
    storeTerminalScrollOnUserInput(nextScrollOnUserInput);
  }, []);

  return {
    initialThemeId: initialThemeIdRef.current,
    initialFontId: initialFontIdRef.current,
    initialFontSize: initialFontSizeRef.current,
    initialLineHeight: initialLineHeightRef.current,
    initialCursorStyle: initialCursorStyleRef.current,
    initialCursorBlink: initialCursorBlinkRef.current,
    initialScrollback: initialScrollbackRef.current,
    initialScrollOnUserInput: initialScrollOnUserInputRef.current,
    initialFont: initialFontRef.current,
    effectiveTheme,
    effectiveFont,
    effectiveCursorStyle,
    activeThemeId,
    activeFontId,
    activeFontSize,
    activeLineHeight,
    activeCursorStyle,
    activeCursorBlink,
    activeScrollback,
    activeScrollOnUserInput,
    handleThemeChange,
    setPreviewThemeId,
    handleFontChange,
    setPreviewFontId,
    handleFontSizeChange,
    handleLineHeightChange,
    handleCursorStyleChange,
    setPreviewCursorStyle,
    handleCursorBlinkChange,
    handleScrollbackChange,
    handleScrollOnUserInputChange,
  };
};
