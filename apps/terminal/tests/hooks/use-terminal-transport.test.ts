import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useTerminalTransport } from "../../src/hooks/use-terminal-transport";
import {
  TERMINAL_MSG_TYPE,
  decodeTerminalMessage,
  encodeTextPayload,
  encodeResizePayload,
  decodeTextPayload,
  decodeExitPayload,
} from "../../src/lib/terminal-codec";
import {
  XUMUX_CONTROL_CHANNEL,
  XUMUX_DEFAULT_SESSION_CHANNEL,
  XUMUX_FRAME_TYPE,
  XUMUX_HEADER_SIZE,
  encodeFrame,
  decodeFrame,
} from "../../src/lib/xumux";

interface FakeWebSocketHandle {
  url: string;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  fireOpen: () => void;
  fireBinaryMessage: (data: Uint8Array) => void;
  fireClose: () => void;
  fireError: () => void;
  binaryType: string;
}

const fakeWebSockets: FakeWebSocketHandle[] = [];

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
      const handle: FakeWebSocketHandle = {
        url,
        send: this.send,
        close: this.close,
        binaryType: this.binaryType,
        fireOpen: () => {
          this.readyState = FakeWebSocket.OPEN;
          this.dispatch("open", {});
        },
        fireBinaryMessage: (data: Uint8Array) => {
          this.dispatch("message", { data: data.buffer });
        },
        fireClose: () => {
          this.readyState = FakeWebSocket.CLOSED;
          this.dispatch("close", {});
        },
        fireError: () => {
          this.dispatch("error", {});
        },
      };
      fakeWebSockets.push(handle);
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

const makeWelcomeFrame = (): Uint8Array =>
  encodeFrame({ channel: XUMUX_CONTROL_CHANNEL, type: XUMUX_FRAME_TYPE.WELCOME, flags: 0, payload: new Uint8Array(0) });

const makeChannelAckFrame = (channelId: number): Uint8Array => {
  const payload = new Uint8Array(2);
  new DataView(payload.buffer).setUint16(0, channelId);
  return encodeFrame({ channel: XUMUX_CONTROL_CHANNEL, type: XUMUX_FRAME_TYPE.CHANNEL_ACK, flags: 0, payload });
};

const makeCloseChannelFrame = (channelId: number): Uint8Array => {
  const payload = new Uint8Array(2);
  new DataView(payload.buffer).setUint16(0, channelId);
  return encodeFrame({ channel: XUMUX_CONTROL_CHANNEL, type: XUMUX_FRAME_TYPE.CLOSE_CHANNEL, flags: 0, payload });
};

const makeDataFrame = (channelId: number, msgType: number, msgPayload: Uint8Array): Uint8Array => {
  const terminalMsg = new Uint8Array(1 + msgPayload.length);
  terminalMsg[0] = msgType;
  terminalMsg.set(msgPayload, 1);
  return encodeFrame({ channel: channelId, type: XUMUX_FRAME_TYPE.DATA, flags: 0, payload: terminalMsg });
};

const makePingFrame = (): Uint8Array =>
  encodeFrame({ channel: XUMUX_CONTROL_CHANNEL, type: XUMUX_FRAME_TYPE.PING, flags: 0, payload: new Uint8Array(0) });

const performHandshake = (socketIndex = 0) => {
  const socket = fakeWebSockets[socketIndex]!;
  socket.fireOpen();
  socket.fireBinaryMessage(makeWelcomeFrame());
  socket.fireBinaryMessage(makeChannelAckFrame(XUMUX_DEFAULT_SESSION_CHANNEL));
};

const decodeSentFrame = (socket: FakeWebSocketHandle, callIndex: number) => {
  const sentData = socket.send.mock.calls[callIndex]?.[0] as Uint8Array;
  return decodeFrame(new Uint8Array(sentData));
};

beforeEach(() => {
  fakeWebSockets.length = 0;
  installFakeWebSocket();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useTerminalTransport", () => {
  it("sends HELLO on WebSocket open", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useTerminalTransport({ onMessage, onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => fakeWebSockets[0]!.fireOpen());

    const helloFrame = decodeSentFrame(fakeWebSockets[0]!, 0);
    expect(helloFrame?.channel).toBe(XUMUX_CONTROL_CHANNEL);
    expect(helloFrame?.type).toBe(XUMUX_FRAME_TYPE.HELLO);
  });

  it("sends OPEN_CHANNEL after WELCOME", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => fakeWebSockets[0]!.fireOpen());
    act(() => fakeWebSockets[0]!.fireBinaryMessage(makeWelcomeFrame()));

    const openChannelFrame = decodeSentFrame(fakeWebSockets[0]!, 1);
    expect(openChannelFrame?.channel).toBe(XUMUX_CONTROL_CHANNEL);
    expect(openChannelFrame?.type).toBe(XUMUX_FRAME_TYPE.OPEN_CHANNEL);
    const requestedChannel = new DataView(openChannelFrame!.payload.buffer, openChannelFrame!.payload.byteOffset).getUint16(0);
    expect(requestedChannel).toBe(XUMUX_DEFAULT_SESSION_CHANNEL);
  });

  it("fires onReady after CHANNEL_ACK", () => {
    const onReady = vi.fn();
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady, onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => performHandshake());

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("resets consecutiveFailures after successful channel open", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => fakeWebSockets[0]!.fireClose());
    expect(result.current.consecutiveFailures).toBe(1);

    act(() => vi.advanceTimersByTime(1500));
    act(() => performHandshake(1));
    expect(result.current.consecutiveFailures).toBe(0);
  });

  it("delivers decoded terminal messages via onMessage", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useTerminalTransport({ onMessage, onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => performHandshake());

    const outputPayload = encodeTextPayload("hello world");
    act(() => fakeWebSockets[0]!.fireBinaryMessage(makeDataFrame(XUMUX_DEFAULT_SESSION_CHANNEL, TERMINAL_MSG_TYPE.OUTPUT, outputPayload)));

    expect(onMessage).toHaveBeenCalledTimes(1);
    const [receivedType, receivedPayload] = onMessage.mock.calls[0]!;
    expect(receivedType).toBe(TERMINAL_MSG_TYPE.OUTPUT);
    expect(decodeTextPayload(receivedPayload)).toBe("hello world");
  });

  it("sends terminal messages as DATA frames on the session channel", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => performHandshake());
    fakeWebSockets[0]!.send.mockClear();

    act(() => result.current.send(TERMINAL_MSG_TYPE.INPUT, encodeTextPayload("ls\n")));

    const sentFrame = decodeSentFrame(fakeWebSockets[0]!, 0);
    expect(sentFrame?.channel).toBe(XUMUX_DEFAULT_SESSION_CHANNEL);
    expect(sentFrame?.type).toBe(XUMUX_FRAME_TYPE.DATA);
    const decoded = decodeTerminalMessage(sentFrame!.payload);
    expect(decoded?.type).toBe(TERMINAL_MSG_TYPE.INPUT);
    expect(decodeTextPayload(decoded!.payload)).toBe("ls\n");
  });

  it("fires onChannelClose when CLOSE_CHANNEL is received", () => {
    const onChannelClose = vi.fn();
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose, onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => performHandshake());
    act(() => fakeWebSockets[0]!.fireBinaryMessage(makeCloseChannelFrame(XUMUX_DEFAULT_SESSION_CHANNEL)));

    expect(onChannelClose).toHaveBeenCalledTimes(1);
  });

  it("fires onConnectionLost when WebSocket closes after successful handshake", () => {
    const onConnectionLost = vi.fn();
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => performHandshake());
    act(() => fakeWebSockets[0]!.fireClose());

    expect(onConnectionLost).toHaveBeenCalledTimes(1);
  });

  it("increments consecutiveFailures on WS close before handshake and auto-reconnects", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    expect(fakeWebSockets).toHaveLength(1);

    act(() => fakeWebSockets[0]!.fireClose());
    expect(result.current.consecutiveFailures).toBe(1);

    act(() => vi.advanceTimersByTime(1500));
    expect(fakeWebSockets).toHaveLength(2);
  });

  it("responds to PING with PONG", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => performHandshake());
    fakeWebSockets[0]!.send.mockClear();

    act(() => fakeWebSockets[0]!.fireBinaryMessage(makePingFrame()));

    const pongFrame = decodeSentFrame(fakeWebSockets[0]!, 0);
    expect(pongFrame?.channel).toBe(XUMUX_CONTROL_CHANNEL);
    expect(pongFrame?.type).toBe(XUMUX_FRAME_TYPE.PONG);
  });

  it("sends keepalive PINGs after WELCOME", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => performHandshake());
    fakeWebSockets[0]!.send.mockClear();

    act(() => vi.advanceTimersByTime(30_000));

    const pingFrame = decodeSentFrame(fakeWebSockets[0]!, 0);
    expect(pingFrame?.channel).toBe(XUMUX_CONTROL_CHANNEL);
    expect(pingFrame?.type).toBe(XUMUX_FRAME_TYPE.PING);
  });

  it("disconnect() prevents further reconnect attempts", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => result.current.disconnect());
    act(() => vi.advanceTimersByTime(5000));

    expect(fakeWebSockets).toHaveLength(1);
  });

  it("reconnect() creates a new connection attempt", () => {
    const { result } = renderHook(() => useTerminalTransport({ onMessage: vi.fn(), onReady: vi.fn(), onChannelClose: vi.fn(), onConnectionLost: vi.fn() }));

    act(() => result.current.connect("ws://localhost:3417/ws"));
    act(() => fakeWebSockets[0]!.fireClose());
    expect(fakeWebSockets).toHaveLength(1);

    act(() => result.current.reconnect());
    expect(fakeWebSockets).toHaveLength(2);
  });

  it("encodes resize payload correctly (big-endian uint16 cols + rows)", () => {
    const payload = encodeResizePayload(120, 40);
    const view = new DataView(payload.buffer);
    expect(view.getUint16(0)).toBe(120);
    expect(view.getUint16(2)).toBe(40);
  });

  it("decodes exit payload with null exit code (-1)", () => {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setInt32(0, -1);
    expect(decodeExitPayload(payload)).toBeNull();
  });

  it("decodes exit payload with numeric exit code", () => {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setInt32(0, 137);
    expect(decodeExitPayload(payload)).toBe(137);
  });
});

describe("xumux frame codec", () => {
  it("round-trips a frame through encode → decode", () => {
    const original = { channel: 0x0001, type: XUMUX_FRAME_TYPE.DATA, flags: 0, payload: new Uint8Array([1, 2, 3]) };
    const encoded = encodeFrame(original);
    const decoded = decodeFrame(encoded);
    expect(decoded?.channel).toBe(original.channel);
    expect(decoded?.type).toBe(original.type);
    expect(decoded?.flags).toBe(original.flags);
    expect(Array.from(decoded!.payload)).toEqual([1, 2, 3]);
  });

  it("returns null for truncated frames", () => {
    expect(decodeFrame(new Uint8Array(4))).toBeNull();
  });

  it("returns null when payload length exceeds available data", () => {
    const frame = encodeFrame({ channel: 0, type: 1, flags: 0, payload: new Uint8Array(10) });
    const truncated = frame.slice(0, XUMUX_HEADER_SIZE + 5);
    expect(decodeFrame(truncated)).toBeNull();
  });
});

describe("terminal codec", () => {
  it("round-trips a terminal message through encode → decode", () => {
    const payload = encodeTextPayload("hello");
    const message = new Uint8Array(1 + payload.length);
    message[0] = TERMINAL_MSG_TYPE.OUTPUT;
    message.set(payload, 1);
    const decoded = decodeTerminalMessage(message);
    expect(decoded?.type).toBe(TERMINAL_MSG_TYPE.OUTPUT);
    expect(decodeTextPayload(decoded!.payload)).toBe("hello");
  });

  it("returns null for empty data", () => {
    expect(decodeTerminalMessage(new Uint8Array(0))).toBeNull();
  });
});
