import { DEFAULT_SETTINGS, updateSettings, useSettingsQuery } from '../db/repositories/kv';
import type { Settings } from '../domain/types';

export interface UseSettings {
  settings: Settings;
  /** 첫 조회가 끝났는지. false인 동안 settings는 기본값. */
  ready: boolean;
  update: (patch: Partial<Omit<Settings, 'key'>>) => Promise<void>;
}

export function useSettings(): UseSettings {
  const stored = useSettingsQuery();
  return {
    settings: stored ?? DEFAULT_SETTINGS,
    ready: stored !== undefined,
    update: async (patch) => {
      await updateSettings(patch);
    },
  };
}
