export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const IS_MAC = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
export const IS_WIN = typeof navigator !== "undefined" && navigator.platform.startsWith("Win");

export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";
export const ALT_KEY = IS_MAC ? "⌥" : "Alt";
