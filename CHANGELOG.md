# Changelog

## [Unreleased]

### Added
- **xumux v0.2 browser-side protocol library** (`apps/terminal/src/lib/xumux/`) — inline XumuxClient + WebSocketAdapter implementing the 8-byte fixed-header binary framing protocol with HELLO/WELCOME handshake, OPEN_CHANNEL/CHANNEL_ACK, PING/PONG keepalive, and CLOSE_CHANNEL lifecycle.
- **Terminal binary codec** (`apps/terminal/src/lib/terminal-codec.ts`) — encode/decode for terminal message types (INPUT, OUTPUT, RESIZE, EXIT, TITLE, SESSION_INFO) using binary payloads (UTF-8, big-endian uint16/int32, JSON).
- **`useTerminalTransport` hook** (`apps/terminal/src/hooks/use-terminal-transport.ts`) — React hook encapsulating the full WebSocket connection lifecycle with xumux protocol, auto-reconnect with backoff, and binary message routing.
- **`useTerminalSettings` hook** (`apps/terminal/src/hooks/use-terminal-settings.ts`) — extracted all terminal appearance/preference state and handlers from `terminal.tsx`.
- **`useFaviconActivity` hook** (`apps/terminal/src/hooks/use-favicon-activity.ts`) — extracted favicon activity/idle state management.
- **`TerminalStatusDialog` component** (`apps/terminal/src/components/terminal-status-dialog.tsx`) — extracted shell-ended and lost-connection modal dialogs.

### Changed
- **`terminal.tsx`** refactored from 863 lines to 495 lines by extracting transport, settings, favicon, and dialog concerns into dedicated hooks and components.
- Terminal component tests updated to use xumux binary protocol frames instead of raw JSON WebSocket messages.
