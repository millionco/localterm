import { useCallback, useEffect, useRef, useState } from "react";
import { RECONNECT_DELAY_MS } from "@/lib/constants";
import {
  TERMINAL_MSG_TYPE,
  decodeTerminalMessage,
  encodeTerminalMessage,
} from "@/lib/terminal-codec";
import {
  WebSocketAdapter,
  XumuxClient,
  XUMUX_DEFAULT_SESSION_CHANNEL,
} from "@/lib/xumux";

export interface UseTerminalTransportOptions {
  onMessage: (type: number, payload: Uint8Array) => void;
  onReady: () => void;
  onChannelClose: () => void;
  onConnectionLost: () => void;
}

export interface UseTerminalTransportReturn {
  connect: (url: string) => void;
  disconnect: () => void;
  send: (type: number, payload: Uint8Array) => void;
  reconnect: () => void;
  consecutiveFailures: number;
}

interface TransportState {
  client: XumuxClient | null;
  adapter: WebSocketAdapter | null;
  url: string | null;
  disposed: boolean;
  wasEverConnected: boolean;
  exited: boolean;
  reconnectTimer: number | null;
}

const createInitialState = (): TransportState => ({
  client: null,
  adapter: null,
  url: null,
  disposed: false,
  wasEverConnected: false,
  exited: false,
  reconnectTimer: null,
});

export const useTerminalTransport = (
  options: UseTerminalTransportOptions,
): UseTerminalTransportReturn => {
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const stateRef = useRef<TransportState>(createInitialState());

  const doConnect = useCallback(() => {
    const state = stateRef.current;
    if (state.disposed || state.exited || !state.url) return;

    state.client?.dispose();

    const adapter = new WebSocketAdapter();
    state.adapter = adapter;

    const client = new XumuxClient(adapter, {
      onData: (_channelId, payload) => {
        const decoded = decodeTerminalMessage(payload);
        if (decoded) optionsRef.current.onMessage(decoded.type, decoded.payload);
      },
      onChannelOpen: () => {
        state.wasEverConnected = true;
        setConsecutiveFailures(0);
        optionsRef.current.onReady();
      },
      onChannelClose: () => {
        state.exited = true;
        optionsRef.current.onChannelClose();
      },
      onReady: () => {
        client.openChannel(XUMUX_DEFAULT_SESSION_CHANNEL);
      },
      onDisconnect: () => {
        if (state.disposed || state.exited) return;
        if (state.wasEverConnected) {
          state.exited = true;
          optionsRef.current.onConnectionLost();
          return;
        }
        setConsecutiveFailures((previous) => previous + 1);
        state.reconnectTimer = window.setTimeout(doConnect, RECONNECT_DELAY_MS);
      },
    });
    state.client = client;

    adapter.connect(state.url);
  }, []);

  const connect = useCallback(
    (url: string) => {
      const state = stateRef.current;
      state.url = url;
      state.disposed = false;
      state.exited = false;
      state.wasEverConnected = false;
      doConnect();
    },
    [doConnect],
  );

  const disconnect = useCallback(() => {
    const state = stateRef.current;
    state.disposed = true;
    if (state.reconnectTimer !== null) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    state.client?.dispose();
    state.client = null;
    state.adapter = null;
  }, []);

  const send = useCallback((type: number, payload: Uint8Array) => {
    const state = stateRef.current;
    if (!state.client) return;
    const message = encodeTerminalMessage(type, payload);
    state.client.sendData(XUMUX_DEFAULT_SESSION_CHANNEL, message);
  }, []);

  const reconnect = useCallback(() => {
    const state = stateRef.current;
    if (state.disposed || state.exited) return;
    if (state.reconnectTimer !== null) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    state.client?.dispose();
    state.client = null;
    state.adapter = null;
    doConnect();
  }, [doConnect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return { connect, disconnect, send, reconnect, consecutiveFailures };
};

export { TERMINAL_MSG_TYPE };
