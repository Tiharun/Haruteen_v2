// DESIGN.md §8.3 백업 알림 조건. 현재 시각은 인자로 받는다.
import type { EpochMs, Meta } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 마지막 백업 후 이 기간이 지나면 알린다. */
export const BACKUP_REMIND_AFTER_MS = 14 * DAY_MS;
/** "나중에"를 누르면 이 기간 동안 숨긴다. */
export const BACKUP_SNOOZE_MS = 7 * DAY_MS;

/** 데이터가 있고, 백업한 적이 없거나 14일이 지났고, "나중에"로 숨긴 기간이 아니면 true. */
export function shouldRemindBackup(hasData: boolean, meta: Meta, now: EpochMs): boolean {
  if (!hasData) return false;
  if (meta.backupReminderDismissedUntil !== null && now < meta.backupReminderDismissedUntil) {
    return false;
  }
  return meta.lastBackupAt === null || now - meta.lastBackupAt >= BACKUP_REMIND_AFTER_MS;
}

export function snoozeUntil(now: EpochMs): EpochMs {
  return now + BACKUP_SNOOZE_MS;
}
