import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { EMPTY_SETTINGS, isConfigured, loadSettings, saveSettings, type Settings } from "./settings";

type SettingsContextValue = {
  settings: Settings;
  ready: boolean;
  configured: boolean;
  update: (next: Settings) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (next: Settings) => {
    await saveSettings(next);
    setSettings(next);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, ready, configured: isConfigured(settings), update }),
    [settings, ready, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings 必须在 SettingsProvider 内使用");
  return value;
}
