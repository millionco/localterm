import { XUMUX_CONTROL_CHANNEL, XUMUX_FRAME_TYPE, XUMUX_KEEPALIVE_INTERVAL_MS } from "./constants";
import { decodeFrame, encodeFrame } from "./frame";
import type { XumuxFrame } from "./frame";
import type { TransportAdapter } from "./websocket-adapter";

export interface XumuxClientCallbacks {
  onData: (channelId: number, payload: Uint8Array) => void;
  onChannelOpen: (channelId: number) => void;
  onChannelClose: (channelId: number) => void;
  onReady: () => void;
  onDisconnect: () => void;
}

export class XumuxClient {
  private adapter: TransportAdapter;
  private callbacks: XumuxClientCallbacks;
  private keepaliveTimer: number | null = null;
  private isWelcomed = false;
  private isDisposed = false;
  private activeChannels = new Set<number>();

  constructor(adapter: TransportAdapter, callbacks: XumuxClientCallbacks) {
    this.adapter = adapter;
    this.callbacks = callbacks;

    this.adapter.onOpen = () => this.handleOpen();
    this.adapter.onMessage = (data) => this.handleMessage(data);
    this.adapter.onClose = () => this.handleClose();
    this.adapter.onError = () => {
      try {
        this.adapter.close();
      } catch {
        /* closing */
      }
    };
  }

  private handleOpen(): void {
    this.sendControl(XUMUX_FRAME_TYPE.HELLO, new Uint8Array(0));
  }

  private handleMessage(data: Uint8Array): void {
    const frame = decodeFrame(data);
    if (!frame) return;

    if (frame.channel === XUMUX_CONTROL_CHANNEL) {
      this.handleControlFrame(frame);
    } else if (frame.type === XUMUX_FRAME_TYPE.DATA) {
      this.callbacks.onData(frame.channel, frame.payload);
    }
  }

  private handleControlFrame(frame: XumuxFrame): void {
    switch (frame.type) {
      case XUMUX_FRAME_TYPE.WELCOME:
        this.isWelcomed = true;
        this.startKeepalive();
        this.callbacks.onReady();
        break;
      case XUMUX_FRAME_TYPE.CHANNEL_ACK: {
        if (frame.payload.length >= 2) {
          const channelId = new DataView(
            frame.payload.buffer,
            frame.payload.byteOffset,
          ).getUint16(0);
          this.activeChannels.add(channelId);
          this.callbacks.onChannelOpen(channelId);
        }
        break;
      }
      case XUMUX_FRAME_TYPE.CLOSE_CHANNEL: {
        if (frame.payload.length >= 2) {
          const channelId = new DataView(
            frame.payload.buffer,
            frame.payload.byteOffset,
          ).getUint16(0);
          this.activeChannels.delete(channelId);
          this.callbacks.onChannelClose(channelId);
        }
        break;
      }
      case XUMUX_FRAME_TYPE.PING:
        this.sendControl(XUMUX_FRAME_TYPE.PONG, new Uint8Array(0));
        break;
    }
  }

  private handleClose(): void {
    // Guard against stale close events firing after dispose().
    // The old WebSocket may fire onClose asynchronously after disposal;
    // without this check the callback schedules a spurious reconnect.
    if (this.isDisposed) return;
    this.stopKeepalive();
    this.isWelcomed = false;
    this.activeChannels.clear();
    this.callbacks.onDisconnect();
  }

  private sendControl(type: number, payload: Uint8Array): void {
    this.adapter.send(
      encodeFrame({ channel: XUMUX_CONTROL_CHANNEL, type, flags: 0, payload }),
    );
  }

  openChannel(channelId: number): void {
    const payload = new Uint8Array(2);
    new DataView(payload.buffer).setUint16(0, channelId);
    this.sendControl(XUMUX_FRAME_TYPE.OPEN_CHANNEL, payload);
  }

  closeChannel(channelId: number): void {
    const payload = new Uint8Array(2);
    new DataView(payload.buffer).setUint16(0, channelId);
    this.sendControl(XUMUX_FRAME_TYPE.CLOSE_CHANNEL, payload);
    this.activeChannels.delete(channelId);
  }

  sendData(channelId: number, payload: Uint8Array): void {
    this.adapter.send(
      encodeFrame({ channel: channelId, type: XUMUX_FRAME_TYPE.DATA, flags: 0, payload }),
    );
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = window.setInterval(() => {
      this.sendControl(XUMUX_FRAME_TYPE.PING, new Uint8Array(0));
    }, XUMUX_KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      window.clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.stopKeepalive();
    // Null out adapter callbacks before closing so the async onClose event
    // that fires after close() cannot re-enter handleClose().
    this.adapter.onClose = () => undefined;
    this.adapter.close();
    this.activeChannels.clear();
    this.isWelcomed = false;
  }

  get welcomed(): boolean {
    return this.isWelcomed;
  }

  get channels(): ReadonlySet<number> {
    return this.activeChannels;
  }
}
