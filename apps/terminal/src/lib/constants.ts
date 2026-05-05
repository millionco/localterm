export const RECONNECT_DELAY_MS = 1000;
export const RESIZE_DEBOUNCE_MS = 80;
export const DEFAULT_TERMINAL_FONT_SIZE_PX = 13;
export const TERMINAL_FONT_SIZE_MIN_PX = 9;
export const TERMINAL_FONT_SIZE_MAX_PX = 24;
export const TERMINAL_FONT_SIZE_STEP_PX = 1;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1.2;
// xterm.js refuses lineHeight < 1 (throws "lineHeight cannot be less than 1").
export const TERMINAL_LINE_HEIGHT_MIN = 1.0;
export const TERMINAL_LINE_HEIGHT_MAX = 2.0;
export const TERMINAL_LINE_HEIGHT_STEP = 0.1;
export const DEFAULT_TERMINAL_CURSOR_BLINK = true;
export const DEFAULT_TERMINAL_SCROLL_ON_USER_INPUT = true;
export const FALLBACK_TERMINAL_BACKGROUND_HEX = "#101010";
export const DEFAULT_DOCUMENT_TITLE = "localterm";
export const DEAD_SESSION_TITLE_PREFIX = "† ";
export const DISCONNECT_MODAL_THRESHOLD_FAILURES = 2;
export const RESTART_COMMAND = "npx localterm@latest start";
export const COPY_FEEDBACK_MS = 1500;
export const RETRY_BUTTON_FEEDBACK_MS = 800;
export const FAVICON_ACTIVE_DEBOUNCE_MS = 250;
export const FAVICON_IDLE_DEBOUNCE_MS = 750;
export const FAVICON_DEAD_OPACITY = 0.35;
export const FAVICON_RECENT_HUES_LIMIT = 16;
export const FAVICON_HUE_GRID_STEP_DEG = 12;
export const FAVICON_HUE_JITTER_RANGE_DEG = FAVICON_HUE_GRID_STEP_DEG;
export const FAVICON_HUE_WHEEL_DEG = 360;

export const TOOLTIP_DELAY_MS = 300;
export const TOOLTIP_SIDE_OFFSET_PX = 8;

export const NUMBER_STEPPER_SCRUB_PIXELS_PER_STEP = 5;

export const TERMINAL_SCROLLBAR_HOVER_ZONE_PX = 32;
export const TERMINAL_SCROLLBAR_HIDE_DELAY_MS = 600;
export const TERMINAL_SCROLLBAR_SCROLL_LINGER_MS = 700;
export const TERMINAL_SCROLLBAR_FADE_IN_MS = 90;
export const TERMINAL_SCROLLBAR_FADE_OUT_MS = 450;
export const TERMINAL_SCROLLBAR_TRACK_INSET_PX = 0.5;
export const TERMINAL_SCROLLBAR_TRACK_WIDTH_PX = 5;
export const TERMINAL_SCROLLBAR_TRACK_EDGE_GUTTER_PX = 4;
export const TERMINAL_SCROLLBAR_THUMB_MIN_HEIGHT_PX = 24;

export const ENTER_KEY_CODE = 13;
export const KEYBOARD_MODIFIER_SHIFT_BIT = 1;
export const KEYBOARD_MODIFIER_ALT_BIT = 2;
export const KEYBOARD_MODIFIER_CTRL_BIT = 4;
export const KEYBOARD_MODIFIER_META_BIT = 8;
// Kitty keyboard protocol "Disambiguate escape codes" flag (bit 0). Active means
// modifier+key combos must be reported as `CSI <keycode>;<mods+1> u` instead of
// the legacy bare control byte (which can't distinguish e.g. Enter vs Shift+Enter).
export const KITTY_KEYBOARD_DISAMBIGUATE_FLAG = 1;
export const KITTY_KEYBOARD_SET_MODE_REPLACE = 1;
export const KITTY_KEYBOARD_SET_MODE_OR = 2;
export const KITTY_KEYBOARD_SET_MODE_AND_NOT = 3;

export const SEARCH_MATCH_BACKGROUND_HEX = "#ffc79944";
export const SEARCH_ACTIVE_MATCH_BACKGROUND_HEX = "#ffc799";
export const SEARCH_ACTIVE_MATCH_BORDER_HEX = "#ff8080";

export const TERMINAL_THEME_STORAGE_KEY = "localterm:terminal-theme-id";
export const TERMINAL_FONT_STORAGE_KEY = "localterm:terminal-font-id";
export const TERMINAL_FONT_SIZE_STORAGE_KEY = "localterm:terminal-font-size";
export const TERMINAL_LINE_HEIGHT_STORAGE_KEY = "localterm:terminal-line-height";
export const TERMINAL_CURSOR_STYLE_STORAGE_KEY = "localterm:terminal-cursor-style";
export const TERMINAL_CURSOR_BLINK_STORAGE_KEY = "localterm:terminal-cursor-blink";
export const TERMINAL_SCROLLBACK_STORAGE_KEY = "localterm:terminal-scrollback";
export const TERMINAL_SCROLL_ON_USER_INPUT_STORAGE_KEY = "localterm:terminal-scroll-on-user-input";
export const GOOGLE_FONTS_STYLESHEET_ID = "localterm-google-fonts";
export const FONT_LOAD_PROBE_PX = 16;
export const FAVICON_SESSION_HUE_STORAGE_KEY = "localterm:favicon-hue";
export const FAVICON_RECENT_HUES_STORAGE_KEY = "localterm:recent-favicon-hues";
