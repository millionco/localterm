import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { ChevronDown, ChevronUp, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsMenu } from "@/components/settings-menu";
import { TerminalStatusDialog } from "@/components/terminal-status-dialog";
import {
  DEAD_SESSION_TITLE_PREFIX,
  DEFAULT_DOCUMENT_TITLE,
  DISCONNECT_MODAL_THRESHOLD_FAILURES,
  FALLBACK_TERMINAL_BACKGROUND_HEX,
  RESIZE_DEBOUNCE_MS,
  SEARCH_ACTIVE_MATCH_BACKGROUND_HEX,
  SEARCH_ACTIVE_MATCH_BORDER_HEX,
  SEARCH_MATCH_BACKGROUND_HEX,
  TOOLTIP_SIDE_OFFSET_PX,
} from "@/lib/constants";
import {
  TERMINAL_MSG_TYPE,
  decodeExitPayload,
  decodeSessionInfoPayload,
  decodeTextPayload,
  encodeResizePayload,
  encodeTextPayload,
} from "@/lib/terminal-codec";
import type { TerminalSessionInfo } from "@/lib/terminal-session-info";
import { useFaviconActivity } from "@/hooks/use-favicon-activity";
import { useTerminalSettings } from "@/hooks/use-terminal-settings";
import { useTerminalTransport } from "@/hooks/use-terminal-transport";
import { awaitFontReady } from "@/utils/await-font-ready";
import { chunkInputByCodeUnits } from "@/utils/chunk-input-by-code-units";
import { detectIsMacPlatform } from "@/utils/detect-is-mac-platform";
import { fitTerminalPreservingScroll } from "@/utils/fit-terminal-preserving-scroll";
import { isFindShortcut } from "@/utils/is-find-shortcut";
import { MAX_INPUT_BYTES } from "localterm-server/protocol";
import "@xterm/xterm/css/xterm.css";

const formatExitMarker = (code: number | null): string => {
  const description = code === null ? "shell exited" : `shell exited with code ${code}`;
  return `\r\n\x1b[2;31m[${description}]\x1b[0m\r\n`;
};

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

const buildWebSocketUrl = (): string => {
  const url = new URL("/ws", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

interface SearchResultState {
  resultIndex: number;
  resultCount: number;
}

interface ExitInfo {
  code: number | null;
}

interface TerminalProps {
  onModalOpenChange?: (open: boolean) => void;
}

export const Terminal = ({ onModalOpenChange }: TerminalProps = {}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const refocusTerminalRef = useRef<(() => void) | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const openSearchOverlayRef = useRef<(() => void) | null>(null);
  const exitedRef = useRef(false);
  const lastTitleRef = useRef("");
  const [exitInfo, setExitInfo] = useState<ExitInfo | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchOpenAttempt, setSearchOpenAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultState>({ resultIndex: -1, resultCount: 0 });
  const [sessionInfo, setSessionInfo] = useState<TerminalSessionInfo | null>(null);
  const isMac = useMemo(detectIsMacPlatform, []);
  const settings = useTerminalSettings();
  const { noteOutputActivity, resetFavicon, markFaviconDead } = useFaviconActivity(exitedRef);

  const markShellDead = useCallback(
    (code: number | null) => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      markFaviconDead();
      terminalRef.current?.write(formatExitMarker(code));
      document.title = titleForDeadSession(lastTitleRef.current);
      setExitInfo({ code });
      setSessionInfo(null);
    },
    [markFaviconDead],
  );

  const applyIncomingTitle = useCallback((rawTitle: string) => {
    if (exitedRef.current) return;
    const trimmed = rawTitle.trim();
    if (!trimmed) return;
    lastTitleRef.current = trimmed;
    document.title = titleForLiveSession(trimmed);
  }, []);

  const transport = useTerminalTransport({
    onMessage: (type, payload) => {
      switch (type) {
        case TERMINAL_MSG_TYPE.OUTPUT:
          terminalRef.current?.write(decodeTextPayload(payload));
          noteOutputActivity();
          break;
        case TERMINAL_MSG_TYPE.TITLE:
          applyIncomingTitle(decodeTextPayload(payload));
          break;
        case TERMINAL_MSG_TYPE.SESSION_INFO: {
          const info = decodeSessionInfoPayload(payload);
          if (info) setSessionInfo(info as TerminalSessionInfo);
          break;
        }
        case TERMINAL_MSG_TYPE.EXIT:
          resetFavicon();
          markShellDead(decodeExitPayload(payload));
          break;
      }
    },
    onReady: () => {
      const terminal = terminalRef.current;
      if (terminal)
        transport.send(TERMINAL_MSG_TYPE.RESIZE, encodeResizePayload(terminal.cols, terminal.rows));
    },
    onChannelClose: () => markShellDead(null),
    onConnectionLost: () => markShellDead(null),
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let resizeTimer: number | null = null;
    void awaitFontReady(settings.initialFont);
    const terminal = new XtermTerminal({
      allowProposedApi: true,
      cursorBlink: settings.initialCursorBlink,
      cursorStyle: settings.initialCursorStyle,
      fontFamily: settings.initialFont.family,
      fontSize: settings.initialFontSize,
      lineHeight: settings.initialLineHeight,
      scrollback: settings.initialScrollback,
      theme: settings.effectiveTheme.colors,
      macOptionIsMeta: true,
      scrollOnUserInput: settings.initialScrollOnUserInput,
    });
    terminalRef.current = terminal;
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(new ClipboardAddon());
    terminal.loadAddon(new ImageAddon());
    terminal.loadAddon(new ProgressAddon());
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = "11";
    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    const searchResultsDisposable = searchAddon.onDidChangeResults(setSearchResults);
    terminal.open(container);
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch {
      /* webgl unavailable; xterm falls back to canvas */
    }
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.key === "Tab" && (event.metaKey || event.ctrlKey)) return false;
      if (isFindShortcut(event, isMac)) {
        if (event.type === "keydown") {
          event.preventDefault();
          openSearchOverlayRef.current?.();
        }
        return false;
      }
      return true;
    });
    const titleDisposable = terminal.onTitleChange(applyIncomingTitle);
    refocusTerminalRef.current = () => terminal.focus();
    const fitToContainer = () => {
      if (!fitTerminalPreservingScroll(terminal, fitAddon)) return;
      transport.send(TERMINAL_MSG_TYPE.RESIZE, encodeResizePayload(terminal.cols, terminal.rows));
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
        transport.send(TERMINAL_MSG_TYPE.INPUT, encodeTextPayload(chunk));
      }
    });
    terminal.onResize(({ cols, rows }) => {
      transport.send(TERMINAL_MSG_TYPE.RESIZE, encodeResizePayload(cols, rows));
    });
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    fitToContainer();
    terminal.focus();
    transport.connect(buildWebSocketUrl());
    return () => {
      transport.disconnect();
      refocusTerminalRef.current = null;
      searchAddonRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
      titleDisposable.dispose();
      searchResultsDisposable.dispose();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resetFavicon();
      observer.disconnect();
      terminal.dispose();
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = settings.effectiveTheme.colors;
  }, [settings.effectiveTheme]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    let cancelled = false;
    void awaitFontReady(settings.effectiveFont).then(() => {
      if (cancelled || !terminalRef.current) return;
      terminalRef.current.options.fontFamily = settings.effectiveFont.family;
      if (fitAddonRef.current) fitTerminalPreservingScroll(terminalRef.current, fitAddonRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.effectiveFont]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = settings.activeFontSize;
    terminal.options.lineHeight = settings.activeLineHeight;
    if (fitAddonRef.current) fitTerminalPreservingScroll(terminal, fitAddonRef.current);
  }, [settings.activeFontSize, settings.activeLineHeight]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.cursorStyle = settings.effectiveCursorStyle;
    terminal.options.cursorBlink = settings.activeCursorBlink;
    terminal.options.scrollback = settings.activeScrollback;
    terminal.options.scrollOnUserInput = settings.activeScrollOnUserInput;
  }, [settings.effectiveCursorStyle, settings.activeCursorBlink, settings.activeScrollback, settings.activeScrollOnUserInput]);

  useEffect(() => {
    if (!isSearchOpen) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [isSearchOpen, searchOpenAttempt]);

  const findNextMatch = useCallback((query: string) => {
    if (!query) { searchAddonRef.current?.clearDecorations(); setSearchResults({ resultIndex: -1, resultCount: 0 }); return; }
    searchAddonRef.current?.findNext(query, { decorations: SEARCH_DECORATION_OPTIONS });
  }, []);

  const findPreviousMatch = useCallback((query: string) => {
    if (!query) return;
    searchAddonRef.current?.findPrevious(query, { decorations: SEARCH_DECORATION_OPTIONS });
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults({ resultIndex: -1, resultCount: 0 });
    searchAddonRef.current?.clearDecorations(); refocusTerminalRef.current?.();
  }, []);

  const openSearchOverlay = useCallback(() => { setIsSearchOpen(true); setSearchOpenAttempt((p) => p + 1); }, []);
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
        if (event.shiftKey) findPreviousMatch(searchQuery);
        else findNextMatch(searchQuery);
      }
    },
    [closeSearch, findNextMatch, findPreviousMatch, isMac, searchQuery],
  );

  const isShellDead = exitInfo !== null;
  const isDisconnected =
    !isShellDead && transport.consecutiveFailures >= DISCONNECT_MODAL_THRESHOLD_FAILURES;
  const isModalOpen = isShellDead || isDisconnected;

  useEffect(() => {
    onModalOpenChange?.(isModalOpen);
  }, [isModalOpen, onModalOpenChange]);

  const matchLabel =
    searchResults.resultCount === 0
      ? "0/0"
      : `${searchResults.resultIndex + 1}/${searchResults.resultCount}`;
  const pageBackground =
    settings.effectiveTheme.colors.background ?? FALLBACK_TERMINAL_BACKGROUND_HEX;

  return (
    <div className="h-dvh w-dvw" style={{ background: pageBackground }}>
      <div className="relative h-full w-full">
        <div ref={containerRef} aria-label="terminal session" className="absolute inset-0" />
        {exitInfo !== null ? (
          <Badge
            variant="destructive"
            role="status"
            aria-live="polite"
            className="absolute top-2 left-3 z-10"
          >
            {exitInfo.code === null ? "exited" : `exited · code ${exitInfo.code}`}
          </Badge>
        ) : null}
        {isSearchOpen ? null : (
          <div
            role="toolbar"
            aria-label="terminal actions"
            className="absolute top-2 right-3 z-10 flex items-center gap-0.5 rounded-md border border-border/60 bg-background/70 p-0.5 text-muted-foreground shadow-xs backdrop-blur-md"
          >
            <SettingsMenu
              themeId={settings.activeThemeId}
              onThemeChange={settings.handleThemeChange}
              onThemePreview={settings.setPreviewThemeId}
              fontId={settings.activeFontId}
              onFontChange={settings.handleFontChange}
              onFontPreview={settings.setPreviewFontId}
              fontSize={settings.activeFontSize}
              onFontSizeChange={settings.handleFontSizeChange}
              lineHeight={settings.activeLineHeight}
              onLineHeightChange={settings.handleLineHeightChange}
              cursorStyle={settings.activeCursorStyle}
              onCursorStyleChange={settings.handleCursorStyleChange}
              onCursorStylePreview={settings.setPreviewCursorStyle}
              cursorBlink={settings.activeCursorBlink}
              onCursorBlinkChange={settings.handleCursorBlinkChange}
              scrollback={settings.activeScrollback}
              onScrollbackChange={settings.handleScrollbackChange}
              scrollOnUserInput={settings.activeScrollOnUserInput}
              onScrollOnUserInputChange={settings.handleScrollOnUserInputChange}
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
                    render={<a href="/" target="_blank" rel="noopener noreferrer" />}
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
            className="absolute top-2 right-3 z-10 w-80 border-border/60 bg-background/70 text-muted-foreground shadow-xs backdrop-blur-md dark:bg-background/70"
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
            </InputGroupAddon>
          </InputGroup>
        ) : null}
      </div>

      <TerminalStatusDialog
        exitCode={exitInfo?.code}
        isShellDead={isShellDead}
        isDisconnected={isDisconnected}
        onReconnect={transport.reconnect}
      />
    </div>
  );
};
