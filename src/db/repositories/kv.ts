import { useLiveQuery } from 'dexie-react-hooks';
import type { Meta, Settings } from '../../domain/types';
import { LIMITS, unwrap, validateTimerSetting, ValidationError } from '../../domain/validation';
import { db } from '../db';

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreak: false,
  autoStartFocus: false,
  soundEnabled: true,
  soundVolume: 70,
  notificationsEnabled: false,
  showTimerInTitle: true,
  dayStartHour: 0,
  weekStartsOn: 1,
  theme: 'system',
};

export const DEFAULT_META: Meta = {
  key: 'meta',
  lastBackupAt: null,
  backupReminderDismissedUntil: null,
};

/** 저장된 값에 기본값을 병합한다. 저장된 값이 없으면 기본값. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...stored, key: 'settings' };
}

export function mergeMeta(stored: Partial<Meta> | undefined): Meta {
  return { ...DEFAULT_META, ...stored, key: 'meta' };
}

export async function getSettings(): Promise<Settings> {
  const stored = await db.kv.get('settings');
  return mergeSettings(stored?.key === 'settings' ? stored : undefined);
}

const TIMER_KEYS = [
  'focusMinutes',
  'shortBreakMinutes',
  'longBreakMinutes',
  'longBreakInterval',
] as const;

/** 일부 항목만 바꿔 저장한다. 처음 쓸 때 레코드가 생성된다. 타이머 값이 범위를 벗어나면 ValidationError. */
export async function updateSettings(patch: Partial<Omit<Settings, 'key'>>): Promise<Settings> {
  for (const key of TIMER_KEYS) {
    const value = patch[key];
    if (value !== undefined) unwrap(validateTimerSetting(key, value));
  }
  if (patch.soundVolume !== undefined) {
    const { min, max } = LIMITS.soundVolume;
    if (
      !Number.isInteger(patch.soundVolume) ||
      patch.soundVolume < min ||
      patch.soundVolume > max
    ) {
      throw new ValidationError(`소리 크기는 ${min}~${max} 사이의 정수여야 해요.`);
    }
  }
  if (patch.dayStartHour !== undefined) {
    const { min, max } = LIMITS.dayStartHour;
    if (
      !Number.isInteger(patch.dayStartHour) ||
      patch.dayStartHour < min ||
      patch.dayStartHour > max
    ) {
      throw new ValidationError(`하루 시작 시각은 ${min}~${max}시 사이여야 해요.`);
    }
  }
  if (patch.weekStartsOn !== undefined && patch.weekStartsOn !== 1 && patch.weekStartsOn !== 7) {
    throw new ValidationError('주 시작 요일은 월요일이나 일요일이어야 해요.');
  }
  return db.transaction('rw', db.kv, async () => {
    const next = { ...(await getSettings()), ...patch };
    await db.kv.put(next);
    return next;
  });
}

export async function getMeta(): Promise<Meta> {
  const stored = await db.kv.get('meta');
  return mergeMeta(stored?.key === 'meta' ? stored : undefined);
}

export async function updateMeta(patch: Partial<Omit<Meta, 'key'>>): Promise<Meta> {
  return db.transaction('rw', db.kv, async () => {
    const next = { ...(await getMeta()), ...patch };
    await db.kv.put(next);
    return next;
  });
}

/** 설정을 구독한다. 첫 조회가 끝나기 전에는 undefined. */
export function useSettingsQuery(): Settings | undefined {
  return useLiveQuery(getSettings, []);
}

export function useMetaQuery(): Meta | undefined {
  return useLiveQuery(getMeta, []);
}
