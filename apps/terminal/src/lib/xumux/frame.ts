import { XUMUX_HEADER_SIZE } from "./constants";

export interface XumuxFrame {
  channel: number;
  type: number;
  flags: number;
  payload: Uint8Array;
}

export const encodeFrame = (frame: XumuxFrame): Uint8Array => {
  const buffer = new Uint8Array(XUMUX_HEADER_SIZE + frame.payload.length);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, frame.channel);
  view.setUint8(2, frame.type);
  view.setUint8(3, frame.flags);
  view.setUint32(4, frame.payload.length);
  buffer.set(frame.payload, XUMUX_HEADER_SIZE);
  return buffer;
};

export const decodeFrame = (data: Uint8Array): XumuxFrame | null => {
  if (data.length < XUMUX_HEADER_SIZE) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const channel = view.getUint16(0);
  const type = view.getUint8(2);
  const flags = view.getUint8(3);
  const payloadLength = view.getUint32(4);
  if (data.length < XUMUX_HEADER_SIZE + payloadLength) return null;
  const payload = data.slice(XUMUX_HEADER_SIZE, XUMUX_HEADER_SIZE + payloadLength);
  return { channel, type, flags, payload };
};
