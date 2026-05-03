export const DEFAULT_PORT = 3417;
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_COLS = 120;
export const DEFAULT_ROWS = 32;
export const DEFAULT_SCROLLBACK = 5000;
export const DEFAULT_SHELL_FALLBACK = "/bin/sh";
export const DEFAULT_TITLE = "shell";
export const PROCESS_TITLE_POLL_MS = 500;
export const PROCESS_TITLE_RESOLVE_TIMEOUT_MS = 250;
export const IDLE_TITLE_MAX_PATH_SEGMENTS = 3;
export const IDLE_TITLE_TRUNCATION_PREFIX = "…";

export const FRIENDLY_ID_SUFFIX_LENGTH = 4;

export const SESSION_IDLE_REAP_MS = 30_000;

export const PTY_ENV_DENYLIST = ["LOCALTERM_DAEMON_CHILD"];

export const MAX_INPUT_BYTES = 64 * 1024;
export const MAX_BODY_BYTES = 4 * 1024;
export const MAX_PATH_BYTES = 4096;
export const MAX_ENV_VALUE_BYTES = 8192;
export const MAX_COLS = 1000;
export const MAX_ROWS = 1000;
export const WS_BACKPRESSURE_THRESHOLD_BYTES = 8 * 1024 * 1024;

export const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
  "0:0:0:0:0:0:0:1",
]);

export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_CREATED = 201;
export const HTTP_STATUS_NO_CONTENT = 204;
export const HTTP_STATUS_BAD_REQUEST = 400;
export const HTTP_STATUS_FORBIDDEN = 403;
export const HTTP_STATUS_NOT_FOUND = 404;
export const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413;

export const WS_READY_STATE_OPEN = 1;
export const WS_CLOSE_POLICY_VIOLATION = 1008;
export const WS_CLOSE_SESSION_NOT_FOUND = 4404;
export const WS_CLOSE_BACKPRESSURE = 4429;
