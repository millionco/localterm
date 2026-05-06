export interface TransportAdapter {
  send(data: Uint8Array): void;
  close(): void;
  onOpen: (() => void) | null;
  onMessage: ((data: Uint8Array) => void) | null;
  onClose: (() => void) | null;
  onError: (() => void) | null;
  readonly isOpen: boolean;
}

export class WebSocketAdapter implements TransportAdapter {
  private socket: WebSocket | null = null;

  onOpen: (() => void) | null = null;
  onMessage: ((data: Uint8Array) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: (() => void) | null = null;

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(url: string): void {
    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";

    this.socket.addEventListener("open", () => this.onOpen?.());
    this.socket.addEventListener("message", (event) => {
      const data =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new TextEncoder().encode(String(event.data));
      this.onMessage?.(data);
    });
    this.socket.addEventListener("close", () => this.onClose?.());
    this.socket.addEventListener("error", () => this.onError?.());
  }

  send(data: Uint8Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  close(): void {
    try {
      this.socket?.close();
    } catch {
      /* socket already closing */
    }
    this.socket = null;
  }
}
