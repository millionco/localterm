import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH,
  TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY,
} from "../../src/lib/constants";
import { loadStoredTerminalLocalFontFamily } from "../../src/utils/load-stored-terminal-local-font-family";
import { storeTerminalLocalFontFamily } from "../../src/utils/store-terminal-local-font-family";

const installFakeLocalStorage = (): Storage => {
  const store = new Map<string, string>();
  const fakeStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
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
  return fakeStorage;
};

describe("local font family storage round-trip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns an empty string when nothing is stored", () => {
    installFakeLocalStorage();
    expect(loadStoredTerminalLocalFontFamily()).toBe("");
  });

  it("persists a trimmed family and reads it back", () => {
    const storage = installFakeLocalStorage();
    storeTerminalLocalFontFamily("  Operator Mono  ");
    expect(storage.getItem(TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY)).toBe("Operator Mono");
    expect(loadStoredTerminalLocalFontFamily()).toBe("Operator Mono");
  });

  it("clears the stored value when given a blank input", () => {
    const storage = installFakeLocalStorage();
    storeTerminalLocalFontFamily("Comic Code");
    storeTerminalLocalFontFamily("   ");
    expect(storage.getItem(TERMINAL_LOCAL_FONT_FAMILY_STORAGE_KEY)).toBeNull();
    expect(loadStoredTerminalLocalFontFamily()).toBe("");
  });

  it("clamps overly long values on write", () => {
    installFakeLocalStorage();
    const oversized = "A".repeat(TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH + 50);
    storeTerminalLocalFontFamily(oversized);
    expect(loadStoredTerminalLocalFontFamily().length).toBe(TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH);
  });
});
