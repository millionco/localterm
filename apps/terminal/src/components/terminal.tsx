import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { Check, ChevronDown, ChevronUp, Copy, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsMenu } from "@/components/settings-menu";
import {
  COPY_FEEDBACK_MS,
  DEAD_SESSION_TITLE_PREFIX,
  DEFAULT_DOCUMENT_TITLE,
  DISCONNECT_MODAL_THRESHOLD_FAILURES,
  ENTER_KEY_CODE,
  FALLBACK_TERMINAL_BACKGROUND_HEX,
  FAVICON_ACTIVE_DEBOUNCE_MS,
  FAVICON_IDLE_DEBOUNCE_MS,
  KEYBOARD_MODIFIER_SHIFT_BIT,
  KITTY_KEYBOARD_DISAMBIGUATE_FLAG,
  LOCAL_FONT_ID,
  KITTY_KEYBOARD_SET_MODE_AND_NOT,
  KITTY_KEYBOARD_SET_MODE_OR,
  KITTY_KEYBOARD_SET_MODE_REPLACE,
  RECONNECT_DELAY_MS,
  RECONNECT_POLL_INTERVAL_MS,
  RESIZE_DEBOUNCE_MS,
  RESIZE_SCROLL_RESTORE_WINDOW_MS,
  RESTART_COMMAND,
  RETRY_BUTTON_FEEDBACK_MS,
  SEARCH_ACTIVE_MATCH_BACKGROUND_HEX,
  SEARCH_ACTIVE_MATCH_BORDER_HEX,
  SEARCH_MATCH_BACKGROUND_HEX,
  TERMINAL_KEYBOARD_HIDE_VIEWPORT_GROWTH_PX,
  TERMINAL_TAP_MOVEMENT_THRESHOLD_PX,
  TERMINAL_VIEWPORT_WIDTH_STABLE_PX,
  TOOLTIP_SIDE_OFFSET_PX,
} from "@/lib/constants";
import { serverToClientMessageSchema } from "@/lib/schemas";
import type { TerminalCursorStyle } from "@/lib/terminal-cursor";
import { findTerminalFontById } from "@/lib/terminal-fonts";
import type { TerminalSessionInfo } from "@/lib/terminal-session-info";
import { findTerminalThemeById } from "@/lib/terminal-themes";
import { awaitFontReady } from "@/utils/await-font-ready";
import { buildKittyKeySequence } from "@/utils/build-kitty-key-sequence";
import {
  captureTerminalScrollAnchor,
  type TerminalScrollAnchor,
} from "@/utils/capture-terminal-scroll-anchor";
import { extractKeyboardModifiers } from "@/utils/extract-keyboard-modifiers";
import { fitTerminalPreservingScroll } from "@/utils/fit-terminal-preserving-scroll";
import { formatConnectionLostMarker } from "@/utils/format-connection-lost-marker";
import { formatShellExitMarker } from "@/utils/format-shell-exit-marker";
import { chunkInputByCodeUnits } from "@/utils/chunk-input-by-code-units";
import { restoreTerminalScrollAnchor } from "@/utils/restore-terminal-scroll-anchor";
import { remeasureTerminalFont } from "@/utils/remeasure-terminal-font";
import { shouldBlockTerminalScrollbackPurge } from "@/utils/should-block-terminal-scrollback-purge";
import { clampTerminalFontSize } from "@/utils/clamp-terminal-font-size";
import { clampTerminalLineHeight } from "@/utils/clamp-terminal-line-height";
import { detectIsAppleWebKit } from "@/utils/detect-is-apple-webkit";
import { detectIsMacPlatform } from "@/utils/detect-is-mac-platform";
import { isFindShortcut } from "@/utils/is-find-shortcut";
import { isCoarsePointer } from "@/utils/is-coarse-pointer";
import { loadStoredLocalFontFamily } from "@/utils/load-stored-local-font-family";
import { loadStoredTerminalCursorBlink } from "@/utils/load-stored-terminal-cursor-blink";
import { loadStoredTerminalCursorStyle } from "@/utils/load-stored-terminal-cursor-style";
import { loadStoredTerminalFontId } from "@/utils/load-stored-terminal-font-id";
import { loadStoredTerminalFontSize } from "@/utils/load-stored-terminal-font-size";
import { loadStoredTerminalLineHeight } from "@/utils/load-stored-terminal-line-height";
import { loadStoredTerminalScrollback } from "@/utils/load-stored-terminal-scrollback";
import { loadStoredTerminalScrollOnUserInput } from "@/utils/load-stored-terminal-scroll-on-user-input";
import { loadStoredTerminalThemeId } from "@/utils/load-stored-terminal-theme-id";
import { setTabFaviconState } from "@/utils/set-tab-favicon-state";
import { shouldSuppressAltBufferWheel } from "@/utils/should-suppress-alt-buffer-wheel";
import { storeLocalFontFamily } from "@/utils/store-local-font-family";
import { storeTerminalCursorBlink } from "@/utils/store-terminal-cursor-blink";
import { storeTerminalCursorStyle } from "@/utils/store-terminal-cursor-style";
import { storeTerminalFontId } from "@/utils/store-terminal-font-id";
import { storeTerminalFontSize } from "@/utils/store-terminal-font-size";
import { storeTerminalLineHeight } from "@/utils/store-terminal-line-height";
import { storeTerminalScrollback } from "@/utils/store-terminal-scrollback";
import { storeTerminalScrollOnUserInput } from "@/utils/store-terminal-scroll-on-user-input";
import { storeTerminalThemeId } from "@/utils/store-terminal-theme-id";
import { syncAppleWebKitViewport } from "@/utils/sync-apple-webkit-viewport";
import { MAX_INPUT_BYTES, type ClientToServerMessage } from "localterm-server/protocol";
import "@xterm/xterm/css/xterm.css";

const titleForLiveSession = (raw: string): string => raw || DEFAULT_DOCUMENT_TITLE;
const titleForDeadSession = (raw: string): string =>
  `${DEAD_SESSION_TITLE_PREFIX}${raw || DEFAULT_DOCUMENT_TITLE}`;

const SEARCH_DECORATION_OPTIONS = {
  matchBackground: SEARCH_MATCH_BACKGROUND_HEX,
  activeMatchBackground: SEARCH_ACTIVE_MATCH_BACKGROUND_HEX,
  activeMatchBorder: SEARCH_ACTIVE_MATCH_BORDER_HEX,
  matchOverviewRuler: SEARCH_ACTIVE_MATCH_BACKGROUND_HEX,
  activeMatchColorOverviewRuler: SEARCH_ACTIVE_MATCH_BORDER_HEX,
};

const CWD_QUERY_PARAM = "cwd";

const buildWebSocketUrl = (cwdOverride?: string | null): string => {
  const url = new URL("/ws", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const cwd = cwdOverride ?? new URLSearchParams(window.location.search).get(CWD_QUERY_PARAM);
  if (cwd) url.searchParams.set(CWD_QUERY_PARAM, cwd);
  return url.toString();
};

const buildNewTabUrl = (cwd: string | null): string => {
  const url = new URL(window.location.origin);
  if (cwd) url.searchParams.set(CWD_QUERY_PARAM, cwd);
  return url.toString();
};

interface SearchResultState {
  resultIndex: number;
  resultCount: number;
}

type ExitInfo =
  | { reason: "shell-exited"; exitCode: number | null }
  | {
      reason: "connection-lost";
      closeCode: number;
      closeReason: string;
      wasClean: boolean;
    };

interface TerminalProps {
  onModalOpenChange?: (open: boolean) => void;
}

interface ResizeScrollRestoreState {
  anchor: TerminalScrollAnchor;
  expiresAtMs: number;
  timer: number;
}

export const Terminal = ({ onModalOpenChange }: TerminalProps = {}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const manualReconnectRef = useRef<(() => void) | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const refocusTerminalRef = useRef<(() => void) | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const retryFeedbackTimerRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const resizeScrollRestoreRef = useRef<ResizeScrollRestoreState | null>(null);
  const initialThemeIdRef = useRef<string>(loadStoredTerminalThemeId());
  const initialFontIdRef = useRef<string>(loadStoredTerminalFontId());
  const initialLocalFontFamilyRef = useRef<string | null>(loadStoredLocalFontFamily());
  const initialFontSizeRef = useRef<number>(loadStoredTerminalFontSize());
  const initialLineHeightRef = useRef<number>(loadStoredTerminalLineHeight());
  const initialCursorStyleRef = useRef<TerminalCursorStyle>(loadStoredTerminalCursorStyle());
  const initialCursorBlinkRef = useRef<boolean>(loadStoredTerminalCursorBlink());
  const initialScrollbackRef = useRef<number>(loadStoredTerminalScrollback());
  const initialScrollOnUserInputRef = useRef<boolean>(loadStoredTerminalScrollOnUserInput());
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const openSearchOverlayRef = useRef<(() => void) | null>(null);
  const [exitInfo, setExitInfo] = useState<ExitInfo | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [hasCopiedRestartCommand, setHasCopiedRestartCommand] = useState(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchOpenAttempt, setSearchOpenAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultState>({
    resultIndex: -1,
    resultCount: 0,
  });
  const [activeThemeId, setActiveThemeId] = useState<string>(initialThemeIdRef.current);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const effectiveThemeId = previewThemeId ?? activeThemeId;
  const effectiveTheme = useMemo(() => findTerminalThemeById(effectiveThemeId), [effectiveThemeId]);
  const [activeFontId, setActiveFontId] = useState<string>(initialFontIdRef.current);
  const [activeLocalFontFamily, setActiveLocalFontFamily] = useState<string | null>(
    initialLocalFontFamilyRef.current,
  );
  const [previewFontId, setPreviewFontId] = useState<string | null>(null);
  const effectiveFontId = previewFontId ?? activeFontId;
  const effectiveFont = useMemo(
    () => findTerminalFontById(effectiveFontId, activeLocalFontFamily),
    [effectiveFontId, activeLocalFontFamily],
  );
  const [activeFontSize, setActiveFontSize] = useState<number>(initialFontSizeRef.current);
  const [activeLineHeight, setActiveLineHeight] = useState<number>(initialLineHeightRef.current);
  const [activeCursorStyle, setActiveCursorStyle] = useState<TerminalCursorStyle>(
    initialCursorStyleRef.current,
  );
  const [previewCursorStyle, setPreviewCursorStyle] = useState<TerminalCursorStyle | null>(null);
  const effectiveCursorStyle = previewCursorStyle ?? activeCursorStyle;
  const [activeCursorBlink, setActiveCursorBlink] = useState<boolean>(
    initialCursorBlinkRef.current,
  );
  const [activeScrollback, setActiveScrollback] = useState<number>(initialScrollbackRef.current);
  const [activeScrollOnUserInput, setActiveScrollOnUserInput] = useState<boolean>(
    initialScrollOnUserInputRef.current,
  );
  const [sessionInfo, setSessionInfo] = useState<TerminalSessionInfo | null>(null);
  const [liveCwd, setLiveCwd] = useState<string | null>(null);
  const liveCwdRef = useRef<string | null>(null);
  const isMac = useMemo(detectIsMacPlatform, []);
  const isTouchDevice = useMemo(isCoarsePointer, []);
  const isAppleWebKit = useMemo(detectIsAppleWebKit, []);

  useEffect(() => {
    if (!isTouchDevice || !isAppleWebKit) return;
    const root = rootRef.current;
    const visualViewport = window.visualViewport;
    if (!root || !visualViewport) return;
    return syncAppleWebKitViewport(root, visualViewport);
  }, [isTouchDevice, isAppleWebKit]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let exited = false;
    let wasEverConnected = false;
    let lastTitle = "";
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let resizeTimer: number | null = null;
    let resizeScrollAnimationFrame: number | null = null;
    let faviconActiveTimer: number | null = null;
    let faviconIdleTimer: number | null = null;
    let faviconState: "idle" | "active" = "idle";
    // Kitty keyboard protocol (https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
    // tracks a stack of flags so a TUI can push/pop reporting modes. We only
    // care that *some* flags are active when intercepting modifier+Enter so
    // shells (which never push flags) keep getting bare \r and don't see CSI u
    // garbage in their input. Stack always has at least one entry per spec.
    const kittyFlagStack: number[] = [0];
    const getKittyFlags = (): number => kittyFlagStack[kittyFlagStack.length - 1] ?? 0;

    const noteOutputActivity = () => {
      if (faviconIdleTimer !== null) {
        window.clearTimeout(faviconIdleTimer);
        faviconIdleTimer = null;
      }
      if (faviconState === "idle" && faviconActiveTimer === null) {
        faviconActiveTimer = window.setTimeout(() => {
          faviconActiveTimer = null;
          if (disposed || exited) return;
          faviconState = "active";
          setTabFaviconState("active");
        }, FAVICON_ACTIVE_DEBOUNCE_MS);
      }
      faviconIdleTimer = window.setTimeout(() => {
        faviconIdleTimer = null;
        if (faviconActiveTimer !== null) {
          window.clearTimeout(faviconActiveTimer);
          faviconActiveTimer = null;
        }
        if (faviconState === "active") {
          faviconState = "idle";
          setTabFaviconState("idle");
        }
      }, FAVICON_IDLE_DEBOUNCE_MS);
    };

    const resetFavicon = () => {
      if (faviconActiveTimer !== null) {
        window.clearTimeout(faviconActiveTimer);
        faviconActiveTimer = null;
      }
      if (faviconIdleTimer !== null) {
        window.clearTimeout(faviconIdleTimer);
        faviconIdleTimer = null;
      }
      if (faviconState === "active") {
        faviconState = "idle";
        setTabFaviconState("idle");
      }
    };

    const initialFont = findTerminalFontById(
      initialFontIdRef.current,
      initialLocalFontFamilyRef.current,
    );

    const terminal = new XtermTerminal({
      allowProposedApi: true,
      cursorBlink: initialCursorBlinkRef.current,
      cursorStyle: initialCursorStyleRef.current,
      fontFamily: initialFont.family,
      fontSize: initialFontSizeRef.current,
      lineHeight: initialLineHeightRef.current,
      scrollback: initialScrollbackRef.current,
      theme: findTerminalThemeById(initialThemeIdRef.current).colors,
      macOptionIsMeta: true,
      scrollOnUserInput: initialScrollOnUserInputRef.current,
    });
    terminalRef.current = terminal;
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(new ClipboardAddon());
    terminal.loadAddon(new ImageAddon());
    terminal.loadAddon(new ProgressAddon());
    const unicodeGraphemesAddon = new UnicodeGraphemesAddon();
    terminal.loadAddon(unicodeGraphemesAddon);
    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    const searchResultsDisposable = searchAddon.onDidChangeResults(setSearchResults);

    terminal.open(container);
    try {
      const webglAddon = new WebglAddon();
      webglAddonRef.current = webglAddon;
      webglAddon.onContextLoss(() => {
        if (webglAddonRef.current === webglAddon) webglAddonRef.current = null;
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      /* webgl unavailable; xterm falls back to canvas */
    }

    const helperTextArea = terminal.textarea;
    if (helperTextArea) {
      helperTextArea.autocomplete = "off";
      helperTextArea.setAttribute("autocapitalize", "off");
      helperTextArea.setAttribute("autocorrect", "off");
      helperTextArea.spellcheck = false;
    }

    let tapStartClientX = 0;
    let tapStartClientY = 0;
    let didTapMoveBeyondThreshold = false;
    const focusTerminalForInput = () => {
      if (terminal.textarea) terminal.textarea.inputMode = "";
      terminal.focus();
    };
    const refocusTerminalQuietly = () => {
      if (isTouchDevice && terminal.textarea) terminal.textarea.inputMode = "none";
      terminal.focus();
    };
    const handleTerminalTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        didTapMoveBeyondThreshold = true;
        return;
      }
      tapStartClientX = event.touches[0].clientX;
      tapStartClientY = event.touches[0].clientY;
      didTapMoveBeyondThreshold = false;
    };
    const handleTerminalTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        didTapMoveBeyondThreshold = true;
        return;
      }
      const movedPx = Math.hypot(
        event.touches[0].clientX - tapStartClientX,
        event.touches[0].clientY - tapStartClientY,
      );
      if (movedPx > TERMINAL_TAP_MOVEMENT_THRESHOLD_PX) {
        didTapMoveBeyondThreshold = true;
      }
    };
    const handleTerminalTouchEnd = (event: TouchEvent) => {
      if (didTapMoveBeyondThreshold) {
        event.preventDefault();
        return;
      }
      focusTerminalForInput();
    };
    const touchListenerAbort = new AbortController();
    if (isTouchDevice) {
      const guardTextarea = () => {
        if (terminal.textarea) terminal.textarea.inputMode = "none";
      };
      const blurAndGuardTextarea = () => {
        if (!terminal.textarea) return;
        terminal.textarea.blur();
        terminal.textarea.inputMode = "none";
      };
      guardTextarea();
      terminal.textarea?.addEventListener("blur", guardTextarea, {
        signal: touchListenerAbort.signal,
      });
      const visualViewport = window.visualViewport;
      if (visualViewport) {
        let previousViewportHeight = visualViewport.height;
        let previousViewportWidth = visualViewport.width;
        const handleViewportResize = () => {
          const height = visualViewport.height;
          const width = visualViewport.width;
          const didViewportGrow =
            height > previousViewportHeight + TERMINAL_KEYBOARD_HIDE_VIEWPORT_GROWTH_PX;
          const didViewportWidthStayStable =
            Math.abs(width - previousViewportWidth) < TERMINAL_VIEWPORT_WIDTH_STABLE_PX;
          if (didViewportGrow && didViewportWidthStayStable) blurAndGuardTextarea();
          previousViewportHeight = height;
          previousViewportWidth = width;
        };
        visualViewport.addEventListener("resize", handleViewportResize, {
          signal: touchListenerAbort.signal,
        });
      }
      terminal.element?.addEventListener("touchstart", handleTerminalTouchStart, {
        capture: true,
        passive: true,
        signal: touchListenerAbort.signal,
      });
      terminal.element?.addEventListener("touchmove", handleTerminalTouchMove, {
        capture: true,
        passive: true,
        signal: touchListenerAbort.signal,
      });
      terminal.element?.addEventListener("touchend", handleTerminalTouchEnd, {
        capture: true,
        passive: false,
        signal: touchListenerAbort.signal,
      });
    }

    const kittyPushDisposable = terminal.parser.registerCsiHandler(
      { prefix: ">", final: "u" },
      (params) => {
        const first = params[0];
        const flags = typeof first === "number" ? first : 1;
        kittyFlagStack.push(flags);
        return true;
      },
    );
    const kittyPopDisposable = terminal.parser.registerCsiHandler(
      { prefix: "<", final: "u" },
      (params) => {
        const first = params[0];
        const count = typeof first === "number" && first > 0 ? first : 1;
        for (let popIndex = 0; popIndex < count && kittyFlagStack.length > 1; popIndex += 1) {
          kittyFlagStack.pop();
        }
        return true;
      },
    );
    const kittySetDisposable = terminal.parser.registerCsiHandler(
      { prefix: "=", final: "u" },
      (params) => {
        const first = params[0];
        const second = params[1];
        // Sub-params (number arrays) aren't defined for kitty `=`. Bail rather
        // than coerce them to 0, which would silently nuke the stack entry.
        if (typeof first !== "number") return true;
        const flags = first;
        const mode =
          typeof second === "number" && second > 0 ? second : KITTY_KEYBOARD_SET_MODE_REPLACE;
        const top = kittyFlagStack.length - 1;
        const current = kittyFlagStack[top] ?? 0;
        if (mode === KITTY_KEYBOARD_SET_MODE_REPLACE) {
          kittyFlagStack[top] = flags;
        } else if (mode === KITTY_KEYBOARD_SET_MODE_OR) {
          kittyFlagStack[top] = current | flags;
        } else if (mode === KITTY_KEYBOARD_SET_MODE_AND_NOT) {
          kittyFlagStack[top] = current & ~flags;
        }
        return true;
      },
    );
    // Inline TUIs should be allowed to clear and repaint the visible screen, but
    // not to delete the browser-owned scrollback. xterm implements ED3
    // (`CSI 3 J`, plus selective `CSI ? 3 J`) by trimming activeBuffer.lines and
    // rewriting ybase/ydisp, which makes Localterm jump to the top and destroys
    // history. Codex emits it after resize reflow; pi-mono and Claude Code emit
    // it on full redraws; Cursor Agent emits it on mount/width-triggered clears. A
    // parser handler is narrower and more robust than byte filtering: xterm
    // normalizes split writes, 8-bit CSI, and `03` params before this callback.
    // We intentionally still allow ED0/1/2 visible clears, alt-buffer switches
    // (`?1049h/l`, handled by xterm without deleting normal scrollback), and
    // RIS (`ESC c`), which is a full terminal reset rather than a redraw clear.
    const scrollbackPurgeDisposable = terminal.parser.registerCsiHandler(
      { final: "J" },
      shouldBlockTerminalScrollbackPurge,
    );
    const selectiveScrollbackPurgeDisposable = terminal.parser.registerCsiHandler(
      { prefix: "?", final: "J" },
      shouldBlockTerminalScrollbackPurge,
    );

    const send = (message: ClientToServerMessage) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };

    const clearResizeScrollRestore = () => {
      const state = resizeScrollRestoreRef.current;
      if (state) window.clearTimeout(state.timer);
      if (resizeScrollAnimationFrame !== null) {
        window.cancelAnimationFrame(resizeScrollAnimationFrame);
        resizeScrollAnimationFrame = null;
      }
      resizeScrollRestoreRef.current = null;
    };

    const restoreResizeScroll = () => {
      const state = resizeScrollRestoreRef.current;
      if (!state) return;
      if (Date.now() > state.expiresAtMs) {
        clearResizeScrollRestore();
        return;
      }
      restoreTerminalScrollAnchor(terminal, state.anchor);
    };

    const restoreAfterOutputWrite = (outputScrollAnchor: TerminalScrollAnchor) => {
      if (resizeScrollRestoreRef.current) {
        restoreResizeScroll();
        return;
      }
      if (outputScrollAnchor.wasAtBottom) restoreTerminalScrollAnchor(terminal, outputScrollAnchor);
    };

    const beginResizeScrollRestore = (anchor: TerminalScrollAnchor) => {
      clearResizeScrollRestore();
      const timer = window.setTimeout(() => {
        restoreResizeScroll();
        resizeScrollRestoreRef.current = null;
      }, RESIZE_SCROLL_RESTORE_WINDOW_MS);
      resizeScrollRestoreRef.current = {
        anchor,
        expiresAtMs: Date.now() + RESIZE_SCROLL_RESTORE_WINDOW_MS,
        timer,
      };
      resizeScrollAnimationFrame = window.requestAnimationFrame(() => {
        resizeScrollAnimationFrame = null;
        restoreResizeScroll();
      });
    };

    terminal.attachCustomWheelEventHandler((event) => {
      if (shouldSuppressAltBufferWheel(event, terminal)) {
        event.preventDefault();
        return false;
      }
      return true;
    });

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.key === "Tab" && (event.metaKey || event.ctrlKey)) return false;
      if (isFindShortcut(event, isMac)) {
        if (event.type === "keydown") {
          event.preventDefault();
          openSearchOverlayRef.current?.();
        }
        return false;
      }
      // xterm.js's default keyboard handler ignores Shift/Ctrl/Meta on Enter
      // and sends bare \r for all of them, so TUIs can't distinguish Shift+Enter
      // from Enter. Three-tier dispatch:
      //   1. Kitty disambiguate flag is active -> emit `CSI 13;mods+1 u` for any
      //      modifier+Enter (including Alt, since the TUI explicitly asked for
      //      the new protocol and prefers it over the legacy \e\r form).
      //   2. Plain Shift+Enter without kitty -> emit LF. This matches the
      //      iTerm2/VS Code/Terminal.app convention that Ink-based TUIs (Claude
      //      Code, Cursor Agent) read as "newline within input". Bash/zsh/fish
      //      bind \n to accept-line just like \r so shells are unaffected.
      //   3. Anything else (plain Enter, Alt-only, Ctrl/Cmd+Enter without
      //      kitty) -> fall through to xterm.js so app-specific bindings keep
      //      working.
      if (event.type === "keydown" && event.key === "Enter") {
        const modifierBits = extractKeyboardModifiers(event);
        const isKittyDisambiguateActive =
          (getKittyFlags() & KITTY_KEYBOARD_DISAMBIGUATE_FLAG) !== 0;
        if (modifierBits !== 0 && isKittyDisambiguateActive) {
          event.preventDefault();
          send({ type: "input", data: buildKittyKeySequence(ENTER_KEY_CODE, modifierBits) });
          return false;
        }
        if (modifierBits === KEYBOARD_MODIFIER_SHIFT_BIT) {
          event.preventDefault();
          send({ type: "input", data: "\n" });
          return false;
        }
      }
      return true;
    });

    const applyIncomingTitle = (rawTitle: string) => {
      if (exited) return;
      const trimmed = rawTitle.trim();
      if (!trimmed) return;
      lastTitle = trimmed;
      document.title = titleForLiveSession(trimmed);
    };

    const titleDisposable = terminal.onTitleChange(applyIncomingTitle);

    refocusTerminalRef.current = refocusTerminalQuietly;

    const sendResize = (cols: number, rows: number) => send({ type: "resize", cols, rows });

    const fitToContainer = () => {
      const resizeScrollAnchor = captureTerminalScrollAnchor(terminal);
      if (!fitTerminalPreservingScroll(terminal, fitAddon)) return;
      beginResizeScrollRestore(resizeScrollAnchor);
    };

    const scheduleFit = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        fitToContainer();
      }, RESIZE_DEBOUNCE_MS);
    };

    terminal.onData((data) => {
      for (const chunk of chunkInputByCodeUnits(data, MAX_INPUT_BYTES)) {
        send({ type: "input", data: chunk });
      }
    });
    terminal.onResize(({ cols, rows }) => sendResize(cols, rows));

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    fitToContainer();
    refocusTerminalQuietly();

    const markShellDead = (exitCode: number | null) => {
      if (exited) return;
      exited = true;
      resetFavicon();
      setTabFaviconState("dead");
      terminal.write(formatShellExitMarker(exitCode));
      document.title = titleForDeadSession(lastTitle);
      setExitInfo({ reason: "shell-exited", exitCode });
      // Clear so the Settings → Shell section doesn't show a stale dead PID/cwd.
      setSessionInfo(null);
    };

    const markConnectionLost = (closeCode: number, closeReason: string, wasClean: boolean) => {
      if (exited) return;
      exited = true;
      resetFavicon();
      setTabFaviconState("dead");
      terminal.write(formatConnectionLostMarker(closeCode, closeReason));
      document.title = titleForDeadSession(lastTitle);
      setExitInfo({ reason: "connection-lost", closeCode, closeReason, wasClean });
      setSessionInfo(null);
    };

    const connect = () => {
      if (disposed) return;
      const nextSocket = new WebSocket(buildWebSocketUrl(liveCwdRef.current));
      nextSocket.binaryType = "arraybuffer";
      socket = nextSocket;

      nextSocket.addEventListener("open", () => {
        if (disposed || socket !== nextSocket) return;
        wasEverConnected = true;
        setConsecutiveFailures(0);
        sendResize(terminal.cols, terminal.rows);
      });

      nextSocket.addEventListener("message", (event) => {
        if (disposed || socket !== nextSocket) return;
        if (event.data instanceof ArrayBuffer) {
          const outputScrollAnchor = captureTerminalScrollAnchor(terminal);
          terminal.write(new Uint8Array(event.data), () =>
            restoreAfterOutputWrite(outputScrollAnchor),
          );
          noteOutputActivity();
          return;
        }
        if (typeof event.data !== "string") return;
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = serverToClientMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "output") {
          const outputScrollAnchor = captureTerminalScrollAnchor(terminal);
          terminal.write(message.data, () => restoreAfterOutputWrite(outputScrollAnchor));
          noteOutputActivity();
        } else if (message.type === "title") {
          applyIncomingTitle(message.title);
        } else if (message.type === "session") {
          setSessionInfo({
            shell: message.shell,
            shellName: message.shellName,
            pid: message.pid,
            cwd: message.cwd,
          });
          setLiveCwd(message.cwd);
        } else if (message.type === "cwd") {
          setLiveCwd(message.cwd);
        } else if (message.type === "exit") {
          resetFavicon();
          markShellDead(message.code);
        }
      });

      nextSocket.addEventListener("close", (event) => {
        if (socket !== nextSocket) return;
        socket = null;
        if (disposed) return;
        if (exited) return;
        if (wasEverConnected) {
          // Surface close metadata in DevTools so "the terminal randomly dies"
          // reports always come back with a concrete code/reason instead of
          // the previous black-box `null` exit.
          console.warn(
            `[localterm] websocket closed: code=${event.code} reason=${JSON.stringify(event.reason)} wasClean=${event.wasClean}`,
          );
          markConnectionLost(event.code, event.reason, event.wasClean);
          return;
        }
        setConsecutiveFailures((previous) => previous + 1);
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });

      nextSocket.addEventListener("error", (event) => {
        console.warn("[localterm] websocket error", event);
        try {
          nextSocket.close();
        } catch {
          /* socket already closing */
        }
      });
    };

    manualReconnectRef.current = () => {
      if (disposed) return;
      // Reset the per-session "we're done" flags so a Reconnect after a shell
      // exit *or* a transport-level connection loss actually opens a fresh WS.
      // The server always spawns a new PTY on connect; the alternative ("must
      // open a new tab") loses the user's tab state for a recoverable failure.
      exited = false;
      wasEverConnected = false;
      setExitInfo(null);
      setSessionInfo(null);
      setConsecutiveFailures(0);
      setTabFaviconState("idle");
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        socket?.close();
      } catch {
        /* socket already closing */
      }
      socket = null;
      connect();
    };

    connect();

    return () => {
      disposed = true;
      manualReconnectRef.current = null;
      refocusTerminalRef.current = null;
      searchAddonRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
      webglAddonRef.current = null;
      titleDisposable.dispose();
      searchResultsDisposable.dispose();
      kittyPushDisposable.dispose();
      kittyPopDisposable.dispose();
      kittySetDisposable.dispose();
      scrollbackPurgeDisposable.dispose();
      selectiveScrollbackPurgeDisposable.dispose();
      touchListenerAbort.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      clearResizeScrollRestore();
      resetFavicon();
      observer.disconnect();
      try {
        socket?.close();
      } catch {
        /* socket already closed */
      }
      socket = null;
      terminal.dispose();
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = effectiveTheme.colors;
  }, [effectiveTheme]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    let cancelled = false;
    void awaitFontReady(effectiveFont).then(() => {
      if (cancelled) return;
      const liveTerminal = terminalRef.current;
      if (!liveTerminal) return;
      const liveFitAddon = fitAddonRef.current;
      if (!liveFitAddon) return;
      remeasureTerminalFont(
        liveTerminal,
        liveFitAddon,
        webglAddonRef.current,
        effectiveFont.family,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveFont]);

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

  const handleLocalFontChange = useCallback((family: string) => {
    setActiveLocalFontFamily(family);
    setActiveFontId(LOCAL_FONT_ID);
    setPreviewFontId(null);
    storeLocalFontFamily(family);
    storeTerminalFontId(LOCAL_FONT_ID);
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = activeFontSize;
    const fitAddon = fitAddonRef.current;
    if (fitAddon) fitTerminalPreservingScroll(terminal, fitAddon);
  }, [activeFontSize]);

  const handleFontSizeChange = useCallback((nextFontSize: number) => {
    const clamped = clampTerminalFontSize(nextFontSize);
    setActiveFontSize(clamped);
    storeTerminalFontSize(clamped);
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.lineHeight = activeLineHeight;
    const fitAddon = fitAddonRef.current;
    if (fitAddon) fitTerminalPreservingScroll(terminal, fitAddon);
  }, [activeLineHeight]);

  const handleLineHeightChange = useCallback((nextLineHeight: number) => {
    const clamped = clampTerminalLineHeight(nextLineHeight);
    setActiveLineHeight(clamped);
    storeTerminalLineHeight(clamped);
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.cursorStyle = effectiveCursorStyle;
  }, [effectiveCursorStyle]);

  const handleCursorStyleChange = useCallback((nextCursorStyle: TerminalCursorStyle) => {
    setActiveCursorStyle(nextCursorStyle);
    setPreviewCursorStyle(null);
    storeTerminalCursorStyle(nextCursorStyle);
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.cursorBlink = activeCursorBlink;
  }, [activeCursorBlink]);

  const handleCursorBlinkChange = useCallback((nextCursorBlink: boolean) => {
    setActiveCursorBlink(nextCursorBlink);
    storeTerminalCursorBlink(nextCursorBlink);
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.scrollback = activeScrollback;
  }, [activeScrollback]);

  const handleScrollbackChange = useCallback((nextScrollback: number) => {
    setActiveScrollback(nextScrollback);
    storeTerminalScrollback(nextScrollback);
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.scrollOnUserInput = activeScrollOnUserInput;
  }, [activeScrollOnUserInput]);

  const handleScrollOnUserInputChange = useCallback((nextScrollOnUserInput: boolean) => {
    setActiveScrollOnUserInput(nextScrollOnUserInput);
    storeTerminalScrollOnUserInput(nextScrollOnUserInput);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isSearchOpen, searchOpenAttempt]);

  const findNextMatch = useCallback((query: string) => {
    if (!query) {
      searchAddonRef.current?.clearDecorations();
      setSearchResults({ resultIndex: -1, resultCount: 0 });
      return;
    }
    searchAddonRef.current?.findNext(query, { decorations: SEARCH_DECORATION_OPTIONS });
  }, []);

  const findPreviousMatch = useCallback((query: string) => {
    if (!query) return;
    searchAddonRef.current?.findPrevious(query, { decorations: SEARCH_DECORATION_OPTIONS });
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResults({ resultIndex: -1, resultCount: 0 });
    searchAddonRef.current?.clearDecorations();
    refocusTerminalRef.current?.();
  }, []);

  const openSearchOverlay = useCallback(() => {
    setIsSearchOpen(true);
    setSearchOpenAttempt((previous) => previous + 1);
  }, []);
  openSearchOverlayRef.current = openSearchOverlay;

  const handleSearchInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setSearchQuery(next);
      findNextMatch(next);
    },
    [findNextMatch],
  );

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (isFindShortcut(event.nativeEvent, isMac)) {
        event.preventDefault();
        event.currentTarget.select();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
          findPreviousMatch(searchQuery);
        } else {
          findNextMatch(searchQuery);
        }
      }
    },
    [closeSearch, findNextMatch, findPreviousMatch, isMac, searchQuery],
  );

  const triggerManualReconnect = useCallback(() => {
    setIsRetryingConnection(true);
    manualReconnectRef.current?.();
    if (retryFeedbackTimerRef.current !== null) {
      window.clearTimeout(retryFeedbackTimerRef.current);
    }
    retryFeedbackTimerRef.current = window.setTimeout(() => {
      retryFeedbackTimerRef.current = null;
      setIsRetryingConnection(false);
    }, RETRY_BUTTON_FEEDBACK_MS);
  }, []);

  const copyRestartCommand = useCallback(() => {
    void navigator.clipboard
      .writeText(RESTART_COMMAND)
      .then(() => {
        setHasCopiedRestartCommand(true);
        if (copyFeedbackTimerRef.current !== null) {
          window.clearTimeout(copyFeedbackTimerRef.current);
        }
        copyFeedbackTimerRef.current = window.setTimeout(() => {
          copyFeedbackTimerRef.current = null;
          setHasCopiedRestartCommand(false);
        }, COPY_FEEDBACK_MS);
      })
      .catch(() => {
        /* clipboard permission denied; user can still select + copy manually */
      });
  }, []);

  useEffect(() => {
    return () => {
      if (retryFeedbackTimerRef.current !== null) {
        window.clearTimeout(retryFeedbackTimerRef.current);
        retryFeedbackTimerRef.current = null;
      }
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    liveCwdRef.current = liveCwd;
    if (!liveCwd) return;
    const url = new URL(window.location.href);
    url.searchParams.set(CWD_QUERY_PARAM, liveCwd);
    window.history.replaceState(null, "", url);
  }, [liveCwd]);

  const newTabUrl = buildNewTabUrl(liveCwd);

  const isSessionOver = exitInfo !== null;
  const isDisconnected =
    !isSessionOver && consecutiveFailures >= DISCONNECT_MODAL_THRESHOLD_FAILURES;
  const isModalOpen = isSessionOver || isDisconnected;

  const isConnectionLost = exitInfo !== null && exitInfo.reason !== "shell-exited";

  useEffect(() => {
    if (!isConnectionLost) return;
    const intervalId = window.setInterval(() => {
      triggerManualReconnect();
    }, RECONNECT_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isConnectionLost, triggerManualReconnect]);

  useEffect(() => {
    onModalOpenChange?.(isModalOpen);
  }, [isModalOpen, onModalOpenChange]);
  const matchLabel =
    searchResults.resultCount === 0
      ? "0/0"
      : `${searchResults.resultIndex + 1}/${searchResults.resultCount}`;

  const pageBackground = effectiveTheme.colors.background ?? FALLBACK_TERMINAL_BACKGROUND_HEX;

  return (
    <main
      ref={rootRef}
      className="h-dvh w-dvw pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
      style={{ background: pageBackground }}
    >
      <div className="relative h-full w-full">
        <div ref={containerRef} aria-label="terminal session" className="absolute inset-0" />
        {exitInfo !== null ? (
          <Badge
            variant="destructive"
            role="status"
            aria-live="polite"
            className="absolute top-2 left-3 z-10"
          >
            {exitInfo.reason === "shell-exited"
              ? exitInfo.exitCode === null
                ? "exited"
                : `exited · code ${exitInfo.exitCode}`
              : `disconnected · code ${exitInfo.closeCode}`}
          </Badge>
        ) : null}
        {isSearchOpen ? null : (
          <div
            role="toolbar"
            aria-label="terminal actions"
            data-terminal-toolbar
            className="absolute top-2 right-3 z-10 flex items-center gap-0.5 rounded-md border border-border/60 bg-background/70 p-0.5 text-muted-foreground shadow-xs backdrop-blur-md"
          >
            <SettingsMenu
              themeId={activeThemeId}
              onThemeChange={handleThemeChange}
              onThemePreview={setPreviewThemeId}
              fontId={activeFontId}
              onFontChange={handleFontChange}
              onFontPreview={setPreviewFontId}
              localFontFamily={activeLocalFontFamily}
              onLocalFontChange={handleLocalFontChange}
              fontSize={activeFontSize}
              onFontSizeChange={handleFontSizeChange}
              lineHeight={activeLineHeight}
              onLineHeightChange={handleLineHeightChange}
              cursorStyle={activeCursorStyle}
              onCursorStyleChange={handleCursorStyleChange}
              onCursorStylePreview={setPreviewCursorStyle}
              cursorBlink={activeCursorBlink}
              onCursorBlinkChange={handleCursorBlinkChange}
              scrollback={activeScrollback}
              onScrollbackChange={handleScrollbackChange}
              scrollOnUserInput={activeScrollOnUserInput}
              onScrollOnUserInputChange={handleScrollOnUserInputChange}
              sessionInfo={sessionInfo}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={openSearchOverlay}
                    aria-label="find in terminal"
                    className="hover:text-foreground"
                  />
                }
              >
                <Search />
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={TOOLTIP_SIDE_OFFSET_PX}>
                Find {isMac ? "(\u2318F)" : "(Ctrl+F)"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    aria-label="open a new shell in a new browser tab"
                    render={<a href={newTabUrl} target="_blank" rel="noopener noreferrer" />}
                    className="hover:text-foreground"
                  />
                }
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={TOOLTIP_SIDE_OFFSET_PX}>
                New shell (new tab)
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {isSearchOpen ? (
          <InputGroup
            role="search"
            aria-label="find in terminal"
            className="absolute top-2 right-3 z-10 w-[min(20rem,calc(100vw-1.5rem))] border-border/60 bg-background/70 text-muted-foreground shadow-xs backdrop-blur-md dark:bg-background/70"
          >
            <InputGroupInput
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleSearchKeyDown}
              placeholder="Find"
              aria-label="find query"
              className="text-xs"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText
                role="status"
                aria-label="match count"
                className="text-xs tabular-nums"
              >
                {matchLabel}
              </InputGroupText>
              <InputGroupButton
                size="icon-xs"
                onClick={() => findPreviousMatch(searchQuery)}
                disabled={searchResults.resultCount === 0}
                aria-label="previous match"
              >
                <ChevronUp />
              </InputGroupButton>
              <InputGroupButton
                size="icon-xs"
                onClick={() => findNextMatch(searchQuery)}
                disabled={searchResults.resultCount === 0}
                aria-label="next match"
              >
                <ChevronDown />
              </InputGroupButton>
              <InputGroupButton
                size="icon-xs"
                onClick={closeSearch}
                aria-label="close search"
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : null}
      </div>

      <AlertDialog open={isModalOpen}>
        <AlertDialogContent>
          {exitInfo !== null ? (
            exitInfo.reason === "shell-exited" ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Shell ended</AlertDialogTitle>
                  <AlertDialogDescription>
                    {exitInfo.exitCode === null || exitInfo.exitCode === 0
                      ? "Open a new shell to keep going, or close this tab."
                      : `Exit code ${exitInfo.exitCode}. Open a new shell to keep going.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction
                    onClick={() => window.open(newTabUrl, "_blank", "noopener,noreferrer")}
                  >
                    New shell
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
                    Connection lost
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    The browser lost its connection to the localterm daemon (close code{" "}
                    {exitInfo.closeCode}
                    {exitInfo.closeReason ? ` · ${exitInfo.closeReason}` : ""}). Reconnecting spawns
                    a fresh shell. The previous one can't be reattached.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction
                    onClick={triggerManualReconnect}
                    disabled={isRetryingConnection}
                  >
                    {isRetryingConnection ? <Spinner data-icon="inline-start" /> : null}
                    Reconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
                  Lost connection
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The localterm server isn't responding. Start it again from your terminal, then
                  retry.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value={RESTART_COMMAND}
                  aria-label="restart command"
                  className="font-mono"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={copyRestartCommand}
                    aria-label={hasCopiedRestartCommand ? "Copied" : "Copy restart command"}
                  >
                    {hasCopiedRestartCommand ? <Check /> : <Copy />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <AlertDialogFooter>
                <AlertDialogAction onClick={triggerManualReconnect} disabled={isRetryingConnection}>
                  {isRetryingConnection ? <Spinner data-icon="inline-start" /> : null}
                  Retry
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
