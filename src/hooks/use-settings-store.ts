"use client";

import { useCallback, useSyncExternalStore } from "react";

interface Settings {
  fixOpponentMistakes: boolean;
  chessComUsername: string | null;
  lichessUsername: string | null;
  lastChessComSync: number | null;
  lastLichessSync: number | null;
}

const STORAGE_KEY = "chess-fixer-settings";
const DEFAULT_SETTINGS: Settings = {
  fixOpponentMistakes: false,
  chessComUsername: null,
  lichessUsername: null,
  lastChessComSync: null,
  lastLichessSync: null,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Settings;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // corrupted — fall through
  }
  return DEFAULT_SETTINGS;
}

// Module-level store so all consumers share state
let currentSettings: Settings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Settings {
  return currentSettings;
}

function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

function setSettingsInternal(next: Settings) {
  currentSettings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full
  }
  listeners.forEach((cb) => cb());
}

// Hydrate once from localStorage on first client load
if (typeof window !== "undefined") {
  currentSettings = loadSettings();
}

export function useSettingsStore() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettingsInternal({ ...currentSettings, ...updates });
  }, []);

  return { settings, updateSettings };
}
