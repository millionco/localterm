const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const TERMINAL_MSG_TYPE = {
  INPUT: 0x01,
  OUTPUT: 0x02,
  RESIZE: 0x03,
  EXIT: 0x04,
  TITLE: 0x05,
  SESSION_INFO: 0x06,
} as const;

export const encodeTerminalMessage = (type: number, payload: Uint8Array): Uint8Array => {
  const message = new Uint8Array(1 + payload.length);
  message[0] = type;
  message.set(payload, 1);
  return message;
};

export const decodeTerminalMessage = (
  data: Uint8Array,
): { type: number; payload: Uint8Array } | null => {
  if (data.length < 1) return null;
  return { type: data[0]!, payload: data.slice(1) };
};

export const encodeTextPayload = (text: string): Uint8Array => textEncoder.encode(text);

export const decodeTextPayload = (payload: Uint8Array): string => textDecoder.decode(payload);

export const encodeResizePayload = (cols: number, rows: number): Uint8Array => {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, cols);
  view.setUint16(2, rows);
  return buffer;
};

export const decodeResizePayload = (
  payload: Uint8Array,
): { cols: number; rows: number } | null => {
  if (payload.length < 4) return null;
  const view = new DataView(payload.buffer, payload.byteOffset);
  return { cols: view.getUint16(0), rows: view.getUint16(2) };
};

// INT32_MIN (0x80000000) is used as the null sentinel for exit codes.
// Real exit codes are 0-255 on POSIX and 0-4294967295 on Windows;
// -2147483648 cannot occur as a genuine exit code on any platform.
const EXIT_CODE_NULL_SENTINEL = -2147483648;

export const encodeExitPayload = (code: number | null): Uint8Array => {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setInt32(0, code ?? EXIT_CODE_NULL_SENTINEL);
  return buffer;
};

export const decodeExitPayload = (payload: Uint8Array): number | null => {
  if (payload.length < 4) return null;
  const code = new DataView(payload.buffer, payload.byteOffset).getInt32(0);
  return code === EXIT_CODE_NULL_SENTINEL ? null : code;
};

export const decodeSessionInfoPayload = (payload: Uint8Array): unknown => {
  try {
    return JSON.parse(textDecoder.decode(payload)) as unknown;
  } catch {
    return null;
  }
};
