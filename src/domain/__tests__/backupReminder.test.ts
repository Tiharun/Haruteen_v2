import { describe, expect, it } from 'vitest';
import { BACKUP_REMIND_AFTER_MS, shouldRemindBackup, snoozeUntil } from '../backup';
import type { Meta } from '../types';

const NOW = 1_800_000_000_000;
const meta = (patch: Partial<Meta> = {}): Meta => ({
  key: 'meta',
  lastBackupAt: null,
  backupReminderDismissedUntil: null,
  ...patch,
});

describe('백업 알림 조건', () => {
  it('데이터가 없으면 알리지 않는다', () => {
    expect(shouldRemindBackup(false, meta(), NOW)).toBe(false);
  });

  it('백업한 적이 없으면 알린다', () => {
    expect(shouldRemindBackup(true, meta(), NOW)).toBe(true);
  });

  it('마지막 백업 14일 전까지는 알리지 않고, 14일이 되면 알린다', () => {
    const last = NOW - BACKUP_REMIND_AFTER_MS;
    expect(shouldRemindBackup(true, meta({ lastBackupAt: last + 1 }), NOW)).toBe(false);
    expect(shouldRemindBackup(true, meta({ lastBackupAt: last }), NOW)).toBe(true);
  });

  it('"나중에"를 누르면 7일간 숨기고, 그 뒤에는 다시 보인다', () => {
    const until = snoozeUntil(NOW);
    expect(until - NOW).toBe(7 * 24 * 60 * 60 * 1000);
    const m = meta({ backupReminderDismissedUntil: until });
    expect(shouldRemindBackup(true, m, NOW + 1000)).toBe(false);
    expect(shouldRemindBackup(true, m, until)).toBe(true);
  });
});
