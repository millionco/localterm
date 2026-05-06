import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Terminal } from "../../src/components/terminal";
import {
  TERMINAL_MSG_TYPE,
  encodeExitPayload,
  encodeTextPayload,
  encodeTerminalMessage,
} from "../../src/lib/terminal-codec";
import {
  XUMUX_CONTROL_CHANNEL,
  XUMUX_DEFAULT_SESSION_CHANNEL,
  XUMUX_FRAME_TYPE,
  encodeFrame,
} from "../../src/lib/xumux";
import {
  DEFAULT_TERMINAL_FONT_SIZE_PX,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  TERMINAL_CURSOR_BLINK_STORAGE_KEY,
  TERMINAL_CURSOR_STYLE_STORAGE_KEY,
  TERMINAL_FONT_SIZE_MIN_PX,
  TERMINAL_FONT_SIZE_STORAGE_KEY,
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LINE_HEIGHT_STORAGE_KEY,
  TERMINAL_SCROLL_ON_USER_INPUT_STORAGE_KEY,
  TERMINAL_SCROLLBACK_STORAGE_KEY,
} from "../../src/lib/constants";
import { DEFAULT_TERMINAL_CURSOR_STYLE } from "../../src/lib/terminal-cursor";
import { DEFAULT_TERMINAL_SCROLLBACK_LINES } from "../../src/lib/terminal-scrollback";

interface FakeWebSocketHandle {
  url: string;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  fireOpen: () => void;
  fireBinaryMessage: (data: Uint8Array) => void;
  fireMessage: (payload: unknown) => void;
  fireClose: (code?: number) => void;
  fireError: () => void;
}

interface FakeXtermHandle {
  customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null;
  fireTitleChange: (title: string) => void;
  getOptions: () => Record<string, unknown>;
  setBufferState: (state: { baseY: number; viewportY: number }) => void;
  scrollLines: ReturnType<typeof vi.fn>;
  scrollToBottom: ReturnType<typeof vi.fn>;
}

interface FakeSearchAddonHandle {
  findNext: ReturnType<typeof vi.fn>;
  findPrevious: ReturnType<typeof vi.fn>;
  clearDecorations: ReturnType<typeof vi.fn>;
  fireResults: (results: { resultIndex: number; resultCount: number }) => void;
}

const fakeWebSockets: FakeWebSocketHandle[] = [];
const fakeXterms: FakeXtermHandle[] = [];
const fakeSearchAddons: FakeSearchAddonHandle[] = [];

const installFakeWebSocket = () => {
  class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly url: string;
    readyState: number = FakeWebSocket.CONNECTING;
    binaryType = "blob";
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = FakeWebSocket.CLOSED;
    });

    constructor(url: string) {
      this.url = url;
      fakeWebSockets.push({
        url,
        send: this.send,
        close: this.close,
        fireOpen: () => {
          this.readyState = FakeWebSocket.OPEN;
          this.dispatch("open", {});
        },
        fireBinaryMessage: (data: Uint8Array) => {
          this.dispatch("message", { data: data.buffer });
        },
        fireMessage: (payload) => {
          this.dispatch("message", { data: JSON.stringify(payload) });
        },
        fireClose: (code = 1006) => {
          this.readyState = FakeWebSocket.CLOSED;
          this.dispatch("close", { code });
        },
        fireError: () => {
          this.dispatch("error", {});
        },
      });
    }

    addEventListener(name: string, handler: (event: unknown) => void): void {
      const set = this.listeners.get(name) ?? new Set();
      set.add(handler);
      this.listeners.set(name, set);
    }

    private dispatch(name: string, event: unknown): void {
      const set = this.listeners.get(name);
      if (!set) return;
      for (const handler of set) handler(event);
    }
  }
  vi.stubGlobal("WebSocket", FakeWebSocket);
};

vi.mock("@xterm/xterm", () => {
  class FakeXtermTerminal {
    cols = 80;
    rows = 24;
    unicode = { activeVersion: "11" };
    options: Record<string, unknown> = {};
    buffer = { active: { baseY: 0, viewportY: 0 } };
    scrollLines = vi.fn();
    scrollToBottom = vi.fn();
    private titleListeners = new Set<(title: string) => void>();
    private handle: FakeXtermHandle;

    constructor(options: Record<string, unknown> = {}) {
      this.options = { ...options };
      this.handle = {
        customKeyEventHandler: null,
        fireTitleChange: (title: string) => {
          for (const listener of this.titleListeners) listener(title);
        },
        getOptions: () => this.options,
        setBufferState: ({ baseY, viewportY }) => {
          this.buffer = { active: { baseY, viewportY } };
        },
        scrollLines: this.scrollLines,
        scrollToBottom: this.scrollToBottom,
      };
      fakeXterms.push(this.handle);
    }

    loadAddon = () => {};
    open = () => {};
    onData = () => {};
    onResize = () => {};
    onTitleChange = (handler: (title: string) => void) => {
      this.titleListeners.add(handler);
      return { dispose: () => this.titleListeners.delete(handler) };
    };
    attachCustomKeyEventHandler = (handler: (event: KeyboardEvent) => boolean) => {
      this.handle.customKeyEventHandler = handler;
    };
    write = () => {};
    reset = () => {};
    focus = () => {};
    dispose = () => {};
  }
  return { Terminal: FakeXtermTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class FakeFitAddon {
    fit = () => {};
  }
  return { FitAddon: FakeFitAddon };
});

vi.mock("@xterm/addon-clipboard", () => {
  class FakeClipboardAddon {}
  return { ClipboardAddon: FakeClipboardAddon };
});

vi.mock("@xterm/addon-unicode11", () => {
  class FakeUnicode11Addon {}
  return { Unicode11Addon: FakeUnicode11Addon };
});

vi.mock("@xterm/addon-web-links", () => {
  class FakeWebLinksAddon {}
  return { WebLinksAddon: FakeWebLinksAddon };
});

vi.mock("@xterm/addon-webgl", () => {
  class FakeWebglAddon {
    onContextLoss = () => {};
    dispose = () => {};
  }
  return { WebglAddon: FakeWebglAddon };
});

vi.mock("@xterm/addon-search", () => {
  class FakeSearchAddon {
    findNext = vi.fn();
    findPrevious = vi.fn();
    clearDecorations = vi.fn();
    private resultsListener: ((r: { resultIndex: number; resultCount: number }) => void) | null =
      null;

    constructor() {
      fakeSearchAddons.push({
        findNext: this.findNext,
        findPrevious: this.findPrevious,
        clearDecorations: this.clearDecorations,
        fireResults: (results) => this.resultsListener?.(results),
      });
    }

    onDidChangeResults = (handler: (r: { resultIndex: number; resultCount: number }) => void) => {
      this.resultsListener = handler;
      return { dispose: () => {} };
    };
    dispose = () => {};
  }
  return { SearchAddon: FakeSearchAddon };
});

vi.mock("@xterm/addon-image", () => {
  class FakeImageAddon {
    dispose = () => {};
  }
  return { ImageAddon: FakeImageAddon };
});

vi.mock("@xterm/addon-progress", () => {
  class FakeProgressAddon {
    dispose = () => {};
  }
  return { ProgressAddon: FakeProgressAddon };
});

const stubBrowserGlobals = () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  });
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
};

const dispatchFindShortcut = (handle: FakeXtermHandle | undefined): boolean | undefined => {
  if (!handle?.customKeyEventHandler) return undefined;
  const event = new KeyboardEvent("keydown", { key: "f", metaKey: true });
  Object.defineProperty(event, "preventDefault", { value: vi.fn() });
  return handle.customKeyEventHandler(event);
};

const originalNavigatorPlatform = navigator.platform;

beforeEach(() => {
  fakeWebSockets.length = 0;
  fakeXterms.length = 0;
  fakeSearchAddons.length = 0;
  stubBrowserGlobals();
  installFakeWebSocket();
  Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});

const makeWelcomeFrame = (): Uint8Array =>
  encodeFrame({ channel: XUMUX_CONTROL_CHANNEL, type: XUMUX_FRAME_TYPE.WELCOME, flags: 0, payload: new Uint8Array(0) });

const makeChannelAckFrame = (channelId: number): Uint8Array => {
  const payload = new Uint8Array(2);
  new DataView(payload.buffer).setUint16(0, channelId);
  return encodeFrame({ channel: XUMUX_CONTROL_CHANNEL, type: XUMUX_FRAME_TYPE.CHANNEL_ACK, flags: 0, payload });
};

const makeTerminalDataFrame = (msgType: number, msgPayload: Uint8Array): Uint8Array => {
  const terminalMsg = encodeTerminalMessage(msgType, msgPayload);
  return encodeFrame({ channel: XUMUX_DEFAULT_SESSION_CHANNEL, type: XUMUX_FRAME_TYPE.DATA, flags: 0, payload: terminalMsg });
};

const performXumuxHandshake = (socketIndex: number) => {
  const socket = fakeWebSockets[socketIndex]!;
  socket.fireOpen();
  socket.fireBinaryMessage(makeWelcomeFrame());
  socket.fireBinaryMessage(makeChannelAckFrame(XUMUX_DEFAULT_SESSION_CHANNEL));
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: originalNavigatorPlatform,
  });
});

describe("Terminal modal", () => {
  it("does not show the lost-connection modal until two consecutive WebSocket closes", () => {
    render(<Terminal />);

    expect(fakeWebSockets).toHaveLength(1);
    expect(screen.queryByText(/Lost connection/i)).toBeNull();

    act(() => {
      fakeWebSockets[0]?.fireClose();
    });
    expect(screen.queryByText(/Lost connection/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(fakeWebSockets).toHaveLength(2);

    act(() => {
      fakeWebSockets[1]?.fireClose();
    });
    expect(screen.queryByText(/Lost connection/i)).not.toBeNull();
  });

  it("closes the lost-connection modal when the WebSocket reconnects successfully", () => {
    render(<Terminal />);
    act(() => {
      fakeWebSockets[0]?.fireClose();
      vi.advanceTimersByTime(1500);
      fakeWebSockets[1]?.fireClose();
    });
    expect(screen.queryByText(/Lost connection/i)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
      performXumuxHandshake(2);
    });
    expect(screen.queryByText(/Lost connection/i)).toBeNull();
  });

  it("renders the dead-pill and 'Shell ended' modal when the server reports an exit", () => {
    render(<Terminal />);
    act(() => {
      performXumuxHandshake(0);
      fakeWebSockets[0]?.fireBinaryMessage(makeTerminalDataFrame(TERMINAL_MSG_TYPE.EXIT, encodeExitPayload(137)));
    });
    expect(screen.queryByText(/Shell ended/i)).not.toBeNull();
    expect(screen.queryByText(/exited · code 137/i)).not.toBeNull();
  });

  it("treats a WebSocket close after a successful handshake as the shell ending", () => {
    render(<Terminal />);
    act(() => {
      performXumuxHandshake(0);
      fakeWebSockets[0]?.fireClose();
    });
    expect(screen.queryByText(/Shell ended/i)).not.toBeNull();
  });

  it("blocks the auto-reconnect loop after the shell exits", () => {
    render(<Terminal />);
    act(() => {
      performXumuxHandshake(0);
      fakeWebSockets[0]?.fireBinaryMessage(makeTerminalDataFrame(TERMINAL_MSG_TYPE.EXIT, encodeExitPayload(0)));
      fakeWebSockets[0]?.fireClose();
      vi.advanceTimersByTime(5000);
    });
    expect(fakeWebSockets).toHaveLength(1);
  });
});

describe("Terminal title", () => {
  it("propagates xterm title changes into document.title for the browser tab", () => {
    render(<Terminal />);

    act(() => {
      fakeXterms[0]?.fireTitleChange("vim foo.ts");
    });
    expect(document.title).toBe("vim foo.ts");
  });
});

describe("Terminal Cmd+F search", () => {
  it("opens the find overlay when the find shortcut fires", () => {
    render(<Terminal />);
    expect(screen.queryByRole("search")).toBeNull();

    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    expect(screen.queryByRole("search")).not.toBeNull();
  });

  it("returns false from the key event handler so xterm does not eat the 'f'", () => {
    render(<Terminal />);
    let handlerResult: boolean | undefined;
    act(() => {
      handlerResult = dispatchFindShortcut(fakeXterms[0]);
    });
    expect(handlerResult).toBe(false);
  });

  it("typing in the find input calls SearchAddon.findNext with the query", () => {
    render(<Terminal />);
    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    const input = screen.getByLabelText("find query") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "build" } });
    });

    expect(fakeSearchAddons[0]?.findNext).toHaveBeenCalledWith(
      "build",
      expect.objectContaining({ decorations: expect.any(Object) }),
    );
  });

  it("Enter advances to the next match and Shift+Enter goes back", () => {
    render(<Terminal />);
    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    const input = screen.getByLabelText("find query") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "needle" } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(fakeSearchAddons[0]?.findNext).toHaveBeenCalledTimes(2);

    act(() => {
      fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    });
    expect(fakeSearchAddons[0]?.findPrevious).toHaveBeenCalledWith(
      "needle",
      expect.objectContaining({ decorations: expect.any(Object) }),
    );
  });

  it("Escape closes the find overlay and clears decorations", () => {
    render(<Terminal />);
    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });
    const input = screen.getByLabelText("find query") as HTMLInputElement;

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });

    expect(screen.queryByRole("search")).toBeNull();
    expect(fakeSearchAddons[0]?.clearDecorations).toHaveBeenCalled();
  });

  it("renders the match counter from onDidChangeResults", () => {
    render(<Terminal />);
    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    act(() => {
      fakeSearchAddons[0]?.fireResults({ resultIndex: 2, resultCount: 7 });
    });

    expect(screen.getByText("3/7")).toBeDefined();
  });

  it("focuses and selects the find input on first open", () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, "focus");
    const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");

    render(<Terminal />);
    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
  });

  it("re-pressing the find shortcut re-selects the existing query while keeping it intact", () => {
    render(<Terminal />);
    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    const input = screen.getByLabelText("find query") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "needle" } });
    });

    const focusSpy = vi.spyOn(input, "focus");
    const selectSpy = vi.spyOn(input, "select");

    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
    expect(input.value).toBe("needle");
  });

  it("intercepts Cmd+F inside the find input so the browser's native find bar stays out", () => {
    render(<Terminal />);
    act(() => {
      dispatchFindShortcut(fakeXterms[0]);
    });

    const input = screen.getByLabelText("find query") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "needle" } });
    });

    const selectSpy = vi.spyOn(input, "select");
    const wasNotPrevented = fireEvent.keyDown(input, { key: "f", metaKey: true });

    expect(selectSpy).toHaveBeenCalled();
    expect(wasNotPrevented).toBe(false);
    expect(input.value).toBe("needle");
  });
});

const installFakeLocalStorage = (initial: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(initial));
  const fakeStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
  vi.stubGlobal("localStorage", fakeStorage);
};

describe("Terminal theme picker", () => {
  it("seeds xterm with the default Vesper theme when no preference is stored", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    const seededTheme = fakeXterms[0]?.getOptions().theme as { background?: string } | undefined;
    expect(seededTheme?.background).toBe("#101010");
  });

  it("seeds xterm with the stored theme on mount", () => {
    installFakeLocalStorage({ "localterm:terminal-theme-id": "dracula" });
    render(<Terminal />);
    const seededTheme = fakeXterms[0]?.getOptions().theme as { background?: string } | undefined;
    expect(seededTheme?.background).toBe("#282a36");
  });

  it("falls back to the default theme when the stored id is unknown", () => {
    installFakeLocalStorage({ "localterm:terminal-theme-id": "totally-made-up" });
    render(<Terminal />);
    const seededTheme = fakeXterms[0]?.getOptions().theme as { background?: string } | undefined;
    expect(seededTheme?.background).toBe("#101010");
  });

  it("exposes a single labelled settings trigger in the toolbar", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    expect(screen.getByLabelText("terminal settings")).not.toBeNull();
  });
});

describe("Terminal font picker", () => {
  it("seeds xterm with Geist Mono when no preference is stored", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    const fontFamily = fakeXterms[0]?.getOptions().fontFamily;
    expect(fontFamily).toContain("Geist Mono");
  });

  it("seeds xterm with the stored font on mount", () => {
    installFakeLocalStorage({ "localterm:terminal-font-id": "jetbrains-mono" });
    render(<Terminal />);
    const fontFamily = fakeXterms[0]?.getOptions().fontFamily;
    expect(fontFamily).toContain("JetBrains Mono");
  });

  it("falls back to the default font when the stored id is unknown", () => {
    installFakeLocalStorage({ "localterm:terminal-font-id": "made-up-font" });
    render(<Terminal />);
    const fontFamily = fakeXterms[0]?.getOptions().fontFamily;
    expect(fontFamily).toContain("Geist Mono");
  });
});

describe("Terminal font size", () => {
  it("seeds xterm with the default font size when no preference is stored", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().fontSize).toBe(DEFAULT_TERMINAL_FONT_SIZE_PX);
  });

  it("seeds xterm with the stored font size on mount", () => {
    installFakeLocalStorage({ [TERMINAL_FONT_SIZE_STORAGE_KEY]: "16" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().fontSize).toBe(16);
  });

  it("clamps an out-of-range stored font size up to the minimum on mount", () => {
    installFakeLocalStorage({ [TERMINAL_FONT_SIZE_STORAGE_KEY]: "2" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().fontSize).toBe(TERMINAL_FONT_SIZE_MIN_PX);
  });

  it("falls back to the default font size when the stored value is not a number", () => {
    installFakeLocalStorage({ [TERMINAL_FONT_SIZE_STORAGE_KEY]: "huge" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().fontSize).toBe(DEFAULT_TERMINAL_FONT_SIZE_PX);
  });
});

describe("Terminal line height", () => {
  it("seeds xterm with the default line height when no preference is stored", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().lineHeight).toBe(DEFAULT_TERMINAL_LINE_HEIGHT);
  });

  it("seeds xterm with the stored line height on mount", () => {
    installFakeLocalStorage({ [TERMINAL_LINE_HEIGHT_STORAGE_KEY]: "1.5" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().lineHeight).toBeCloseTo(1.5, 5);
  });

  it("clamps an out-of-range stored line height down to the maximum on mount", () => {
    installFakeLocalStorage({ [TERMINAL_LINE_HEIGHT_STORAGE_KEY]: "9" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().lineHeight).toBe(TERMINAL_LINE_HEIGHT_MAX);
  });
});

describe("Terminal cursor style", () => {
  it("seeds xterm with the default cursor style when no preference is stored", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().cursorStyle).toBe(DEFAULT_TERMINAL_CURSOR_STYLE);
  });

  it("seeds xterm with the stored cursor style on mount", () => {
    installFakeLocalStorage({ [TERMINAL_CURSOR_STYLE_STORAGE_KEY]: "bar" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().cursorStyle).toBe("bar");
  });

  it("falls back to the default cursor style when the stored value is unknown", () => {
    installFakeLocalStorage({ [TERMINAL_CURSOR_STYLE_STORAGE_KEY]: "spinning-rainbow" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().cursorStyle).toBe(DEFAULT_TERMINAL_CURSOR_STYLE);
  });
});

describe("Terminal cursor blink", () => {
  it("seeds xterm with cursor blink enabled by default", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().cursorBlink).toBe(true);
  });

  it("seeds xterm with the stored cursor blink preference", () => {
    installFakeLocalStorage({ [TERMINAL_CURSOR_BLINK_STORAGE_KEY]: "false" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().cursorBlink).toBe(false);
  });

  it("falls back to the default when the stored value is neither 'true' nor 'false'", () => {
    installFakeLocalStorage({ [TERMINAL_CURSOR_BLINK_STORAGE_KEY]: "maybe" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().cursorBlink).toBe(true);
  });
});

describe("Terminal scrollback", () => {
  it("seeds xterm with the default scrollback when no preference is stored", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().scrollback).toBe(DEFAULT_TERMINAL_SCROLLBACK_LINES);
  });

  it("seeds xterm with the stored scrollback on mount", () => {
    installFakeLocalStorage({ [TERMINAL_SCROLLBACK_STORAGE_KEY]: "50000" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().scrollback).toBe(50000);
  });

  it("falls back to the default when the stored value is not a known preset", () => {
    installFakeLocalStorage({ [TERMINAL_SCROLLBACK_STORAGE_KEY]: "12345" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().scrollback).toBe(DEFAULT_TERMINAL_SCROLLBACK_LINES);
  });
});

describe("Terminal scrollOnUserInput", () => {
  it("seeds xterm with scrollOnUserInput=true by default", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().scrollOnUserInput).toBe(true);
  });

  it("seeds xterm with the stored scrollOnUserInput preference", () => {
    installFakeLocalStorage({ [TERMINAL_SCROLL_ON_USER_INPUT_STORAGE_KEY]: "false" });
    render(<Terminal />);
    expect(fakeXterms[0]?.getOptions().scrollOnUserInput).toBe(false);
  });

  it("toggling the pin-to-bottom switch updates terminal.options.scrollOnUserInput", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    fireEvent.click(screen.getByLabelText("terminal settings"));

    expect(fakeXterms[0]?.getOptions().scrollOnUserInput).toBe(true);
    act(() => {
      fireEvent.click(screen.getByLabelText("toggle pin to bottom on input"));
    });
    expect(fakeXterms[0]?.getOptions().scrollOnUserInput).toBe(false);
  });
});

describe("Terminal scroll preservation through hot-swaps", () => {
  // The fake fitAddon doesn't simulate column reflow, so we can't measure the
  // EXACT post-fit viewportY here. The test below is a regression guard for the
  // visible bug — "scrolled-up users got snapped to the bottom on every fit()" —
  // by asserting scrollToBottom is NOT called. Full reflow-aware verification
  // lives in tests/utils/fit-terminal-preserving-scroll.test.ts.
  it("does not call scrollToBottom on font size change when the user is scrolled up", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    const handle = fakeXterms[0];
    if (!handle) throw new Error("xterm not constructed");
    // Mount + initial fits already happened with default {baseY:0, viewportY:0} → those
    // legitimately called scrollToBottom. Clear before the actionable change.
    handle.scrollToBottom.mockClear();
    handle.scrollLines.mockClear();
    // Pretend the user scrolled up 30 lines.
    handle.setBufferState({ baseY: 100, viewportY: 70 });

    fireEvent.click(screen.getByLabelText("terminal settings"));
    act(() => {
      fireEvent.click(screen.getByLabelText("increase font size"));
    });

    // The bug we fixed: scrolled-up users used to be snapped to the bottom on every fit().
    expect(handle.scrollToBottom).not.toHaveBeenCalled();
  });

  it("snaps to the bottom on font size change when the user is already at the bottom", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    const handle = fakeXterms[0];
    if (!handle) throw new Error("xterm not constructed");
    handle.setBufferState({ baseY: 0, viewportY: 0 });

    fireEvent.click(screen.getByLabelText("terminal settings"));
    handle.scrollToBottom.mockClear();
    act(() => {
      fireEvent.click(screen.getByLabelText("increase font size"));
    });

    expect(handle.scrollToBottom).toHaveBeenCalled();
  });
});

describe("Terminal live preview", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  const openThemeSelect = () => {
    fireEvent.click(screen.getByLabelText("terminal settings"));
    fireEvent.click(screen.getByLabelText("select theme"));
  };

  const openFontSelect = () => {
    fireEvent.click(screen.getByLabelText("terminal settings"));
    fireEvent.click(screen.getByLabelText("select font"));
  };

  const openCursorStyleSelect = () => {
    fireEvent.click(screen.getByLabelText("terminal settings"));
    fireEvent.click(screen.getByLabelText("select cursor style"));
  };

  it("hovering a theme item swaps terminal.options.theme to that theme", async () => {
    installFakeLocalStorage();
    render(<Terminal />);
    openThemeSelect();

    const draculaItem = await screen.findByText("Dracula");
    act(() => {
      fireEvent.pointerEnter(draculaItem);
    });

    const previewedTheme = fakeXterms[0]?.getOptions().theme as { background?: string } | undefined;
    expect(previewedTheme?.background).toBe("#282a36");
  });

  it("closing the outer popover while hovering reverts terminal.options.theme to the committed value", async () => {
    installFakeLocalStorage();
    render(<Terminal />);
    openThemeSelect();

    const draculaItem = await screen.findByText("Dracula");
    act(() => {
      fireEvent.pointerEnter(draculaItem);
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("terminal settings"));
    });

    const revertedTheme = fakeXterms[0]?.getOptions().theme as { background?: string } | undefined;
    expect(revertedTheme?.background).toBe("#101010");
  });

  it("hovering a font item swaps terminal.options.fontFamily to that font", async () => {
    installFakeLocalStorage();
    render(<Terminal />);
    openFontSelect();

    const jetbrainsItem = await screen.findByText("JetBrains Mono");
    act(() => {
      fireEvent.pointerEnter(jetbrainsItem);
    });

    await vi.waitFor(() => {
      const previewedFontFamily = fakeXterms[0]?.getOptions().fontFamily;
      expect(previewedFontFamily).toContain("JetBrains Mono");
    });
  });

  it("hovering a cursor style item swaps terminal.options.cursorStyle to that style", async () => {
    installFakeLocalStorage();
    render(<Terminal />);
    openCursorStyleSelect();

    const barItem = await screen.findByText("Bar");
    act(() => {
      fireEvent.pointerEnter(barItem);
    });

    expect(fakeXterms[0]?.getOptions().cursorStyle).toBe("bar");
  });

  it("closing the outer popover while hovering reverts terminal.options.cursorStyle to the committed value", async () => {
    installFakeLocalStorage();
    render(<Terminal />);
    openCursorStyleSelect();

    const barItem = await screen.findByText("Bar");
    act(() => {
      fireEvent.pointerEnter(barItem);
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("terminal settings"));
    });

    expect(fakeXterms[0]?.getOptions().cursorStyle).toBe(DEFAULT_TERMINAL_CURSOR_STYLE);
  });
});

describe("Terminal hot-swap", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  const openSettings = () => {
    fireEvent.click(screen.getByLabelText("terminal settings"));
  };

  it("clicking the line height + button updates terminal.options.lineHeight", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    openSettings();

    const seededLineHeight = fakeXterms[0]?.getOptions().lineHeight as number;
    act(() => {
      fireEvent.click(screen.getByLabelText("increase line height"));
    });

    const updatedLineHeight = fakeXterms[0]?.getOptions().lineHeight as number;
    expect(updatedLineHeight).toBeGreaterThan(seededLineHeight);
  });

  it("toggling the cursor blink switch updates terminal.options.cursorBlink", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    openSettings();

    expect(fakeXterms[0]?.getOptions().cursorBlink).toBe(true);
    act(() => {
      fireEvent.click(screen.getByLabelText("toggle cursor blink"));
    });
    expect(fakeXterms[0]?.getOptions().cursorBlink).toBe(false);
  });
});

describe("Terminal shell info", () => {
  it("renders the shell info from a 'session' WS frame in the settings menu", () => {
    installFakeLocalStorage();
    render(<Terminal />);
    act(() => {
      performXumuxHandshake(0);
      const sessionPayload = encodeTextPayload(JSON.stringify({
        shell: "/opt/homebrew/bin/fish",
        shellName: "fish",
        pid: 54321,
        cwd: "/Users/tester/Developer/localterm",
      }));
      fakeWebSockets[0]?.fireBinaryMessage(makeTerminalDataFrame(TERMINAL_MSG_TYPE.SESSION_INFO, sessionPayload));
    });

    fireEvent.click(screen.getByLabelText("terminal settings"));
    fireEvent.click(screen.getByRole("button", { name: /^shell$/i }));

    expect(screen.getByText("fish")).toBeDefined();
    expect(screen.getByText("/opt/homebrew/bin/fish")).toBeDefined();
    expect(screen.getByText("54321")).toBeDefined();
  });
});
