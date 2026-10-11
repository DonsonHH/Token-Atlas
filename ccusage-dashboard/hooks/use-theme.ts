"use client";

import { useSyncExternalStore } from "react";

const themeEvent = "token-atlas-theme-change";
function subscribe(callback: () => void) {
  window.addEventListener(themeEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(themeEvent, callback);
    window.removeEventListener("storage", callback);
  };
}
function currentTheme() {
  return document.documentElement.classList.contains("dark");
}

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, currentTheme, () => false);
  function setDark(next: boolean) {
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem("token-atlas-theme", next ? "dark" : "light");
    } catch {}
    window.dispatchEvent(new Event(themeEvent));
  }
  return { dark, setDark };
}
