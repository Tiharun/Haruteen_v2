import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../../domain/validation';
import { db } from '../db';
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  getMeta,
  getSettings,
  updateMeta,
  updateSettings,
} from '../repositories/kv';

beforeEach(async () => {
  await db.open();
  await db.kv.clear();
});

describe('DB 스키마', () => {
  it('테이블 7개가 모두 있다', () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'focusSessions',
      'habitLogs',
      'habits',
      'kv',
      'projects',
      'tags',
      'tasks',
    ]);
  });
});

describe('kv: Settings', () => {
  it('저장된 값이 없으면 기본값을 돌려주고, 읽기만으로는 레코드를 만들지 않는다', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await db.kv.count()).toBe(0);
  });

  it('일부만 바꿔 저장하면 나머지는 기본값과 병합된다', async () => {
    const next = await updateSettings({ theme: 'dark', dayStartHour: 4 });
    expect(next.theme).toBe('dark');
    expect(next.focusMinutes).toBe(25);
    expect(await getSettings()).toEqual(next);
  });

  it('나중에 추가된 설정 항목이 옛 레코드에 없어도 기본값으로 채워진다', async () => {
    await db.kv.put({ key: 'settings', theme: 'light' } as never);
    const settings = await getSettings();
    expect(settings.theme).toBe('light');
    expect(settings.soundVolume).toBe(DEFAULT_SETTINGS.soundVolume);
  });
});

describe('kv: Meta', () => {
  it('기본값을 읽고 갱신한다', async () => {
    expect(await getMeta()).toEqual(DEFAULT_META);
    await updateMeta({ lastBackupAt: 123 });
    expect((await getMeta()).lastBackupAt).toBe(123);
  });
});

describe('kv: 타이머 설정 검증', () => {
  it('범위를 벗어난 타이머 값은 저장하지 않고 ValidationError를 던진다', async () => {
    await expect(updateSettings({ focusMinutes: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ focusMinutes: 121 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ longBreakInterval: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ soundVolume: 101 })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.kv.count()).toBe(0);
  });

  it('경계값은 저장된다', async () => {
    const next = await updateSettings({ focusMinutes: 1, longBreakMinutes: 60, soundVolume: 0 });
    expect(next).toMatchObject({ focusMinutes: 1, longBreakMinutes: 60, soundVolume: 0 });
  });
});
