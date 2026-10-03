// DESIGN.md §8 백업 · 복원. 내보내기, 불러오기 검증(zod), 참조 정리, 버전 마이그레이션, 단일 트랜잭션 교체.
import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { SCHEMA_VERSION } from '../config';
import { fromDate, parseLocalDate } from '../domain/dates';
import { DEFAULT_TIMER_STATE } from '../domain/timer';
import type {
  EpochMs,
  FocusSession,
  Habit,
  HabitLog,
  LocalDate,
  Project,
  Settings,
  Tag,
  Task,
  TimerState,
} from '../domain/types';
import { LIMITS, normalizeText } from '../domain/validation';
import { db } from './db';
import { getTimerState } from './repositories/focus';
import { getSettings, mergeSettings, updateMeta } from './repositories/kv';

/** 불러올 파일의 최대 크기 (DESIGN.md §8.2) */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
/** 화면에 보여 줄 검증 오류의 최대 개수 */
export const MAX_SHOWN_ERRORS = 5;

const BACKUP_APP_ID = 'haruteen';

// ---- 형식 ----

export interface BackupData {
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  settings: Partial<Omit<Settings, 'key'>>;
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: EpochMs;
  data: BackupData;
}

export interface BackupCounts {
  tasks: number;
  projects: number;
  tags: number;
  habits: number;
  habitLogs: number;
  focusSessions: number;
}

/** 참조 정리로 고친 개수 (DESIGN.md §8.2-3) */
export interface CleanupReport {
  /** 없는 프로젝트를 가리켜 프로젝트 없음으로 바꾼 할 일 수 */
  taskProjectCleared: number;
  /** 없는 태그라서 떼어 낸 태그 수 */
  taskTagsRemoved: number;
  /** 없는 습관의 기록이라 지운 수 */
  habitLogsRemoved: number;
}

// ---- 스키마 ----

const charCount = (s: string) => Array.from(s).length;

/** 앱 안의 저장 규칙(`normalizeText`)처럼 앞뒤 공백을 지우고 NFC로 맞춘 뒤 길이를 잰다. */
function text(min: number, max: number) {
  const tooShort = min <= 1 ? '비어 있음' : `${min}자 미만`;
  return z
    .string()
    .transform(normalizeText)
    .refine((s) => charCount(s) >= min, tooShort)
    .refine((s) => charCount(s) <= max, `${max}자 초과`);
}

/** id는 다른 항목이 가리키므로 값을 바꾸지 않고 길이만 확인한다. */
const id = z
  .string()
  .refine((s) => charCount(s) >= 1, '비어 있음')
  .refine((s) => charCount(s) <= 100, '100자 초과');
const epoch = z.number().int().min(0);
const duration = z.number().min(0);
const localDate = z
  .string()
  .refine((s) => parseLocalDate(s) !== null, 'YYYY-MM-DD 날짜가 아님')
  .transform((s) => s as LocalDate);
const color = z.enum(['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple']);

/** id가 같은 항목이 둘 이상이면 오류. 오류는 두 번째 항목에 붙인다. */
function uniqueIds<T extends { id: string }>(items: T[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id))
      ctx.addIssue({ code: 'custom', message: 'id 중복', path: [index, 'id'] });
    seen.add(item.id);
  });
}

/** 이름이 대소문자를 무시하고 겹치면 오류. 오류는 두 번째 항목에 붙인다. */
function uniqueNames<T extends { name: string }>(items: T[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', message: '이름 중복', path: [index, 'name'] });
    }
    seen.add(key);
  });
}

const subtaskSchema = z.object({
  id,
  title: text(LIMITS.subtaskTitle.min, LIMITS.subtaskTitle.max),
  done: z.boolean(),
});

const taskSchema = z
  .object({
    id,
    title: text(LIMITS.taskTitle.min, LIMITS.taskTitle.max),
    note: text(LIMITS.taskNote.min, LIMITS.taskNote.max),
    priority: z.enum(['high', 'medium', 'low']),
    dueDate: localDate.nullable(),
    projectId: id.nullable(),
    tagIds: z.array(id).max(LIMITS.maxTagsPerTask, `${LIMITS.maxTagsPerTask}개 초과`),
    subtasks: z
      .array(subtaskSchema)
      .max(LIMITS.maxSubtasksPerTask, `${LIMITS.maxSubtasksPerTask}개 초과`),
    status: z.enum(['todo', 'done']),
    completedAt: epoch.nullable(),
    createdAt: epoch,
    updatedAt: epoch,
  })
  .refine((task) => (task.status === 'done') === (task.completedAt !== null), {
    message: 'status와 completedAt이 맞지 않음',
    path: ['completedAt'],
  });

const projectSchema = z.object({
  id,
  name: text(LIMITS.projectName.min, LIMITS.projectName.max),
  color,
  order: z.number(),
  createdAt: epoch,
});

const tagSchema = z.object({
  id,
  name: text(LIMITS.tagName.min, LIMITS.tagName.max),
  color,
  createdAt: epoch,
});

const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({
    type: z.literal('weekdays'),
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1, '요일이 비어 있음')
      .max(6, '6개 초과')
      .refine((days) => days.every((day, i) => i === 0 || day > (days[i - 1] ?? 0)), {
        message: '요일이 중복되었거나 오름차순이 아님',
      })
      .transform((days) => days as (1 | 2 | 3 | 4 | 5 | 6 | 7)[]),
  }),
  z.object({ type: z.literal('weeklyCount'), count: z.number().int().min(1).max(6) }),
]);

const goalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('check') }),
  z.object({
    type: z.literal('count'),
    target: z.number().int().min(LIMITS.countTarget.min).max(LIMITS.countTarget.max),
    unit: text(LIMITS.countUnit.min, LIMITS.countUnit.max),
  }),
]);

const habitSchema = z.object({
  id,
  name: text(LIMITS.habitName.min, LIMITS.habitName.max),
  note: text(LIMITS.habitNote.min, LIMITS.habitNote.max),
  color,
  emoji: text(1, 16)
    .refine((s) => Array.from(new Intl.Segmenter().segment(s)).length === 1, '이모지는 1개만 가능')
    .nullable(),
  schedule: scheduleSchema,
  goal: goalSchema,
  startDate: localDate,
  archivedOn: localDate.nullable(),
  order: z.number(),
  createdAt: epoch,
  updatedAt: epoch,
});

const habitLogSchema = z
  .object({
    id,
    habitId: id,
    date: localDate,
    value: z.number().int().min(1).max(LIMITS.habitLogValue.max),
    updatedAt: epoch,
  })
  .refine((log) => log.id === `${log.habitId}:${log.date}`, {
    message: 'id가 "습관id:날짜"와 다름',
    path: ['id'],
  });

const focusSessionSchema = z
  .object({
    id,
    target: z
      .object({
        type: z.enum(['task', 'habit']),
        id,
        titleSnapshot: text(0, 500),
      })
      .nullable(),
    targetId: id.nullable(),
    startedAt: epoch,
    endedAt: epoch,
    plannedMs: duration,
    actualMs: duration,
    completed: z.boolean(),
  })
  .refine((session) => session.targetId === (session.target?.id ?? null), {
    message: 'targetId가 target.id와 다름',
    path: ['targetId'],
  });

const int = (range: { min: number; max: number }) => z.number().int().min(range.min).max(range.max);

const settingsSchema = z
  .object({
    focusMinutes: int(LIMITS.focusMinutes),
    shortBreakMinutes: int(LIMITS.shortBreakMinutes),
    longBreakMinutes: int(LIMITS.longBreakMinutes),
    longBreakInterval: int(LIMITS.longBreakInterval),
    autoStartBreak: z.boolean(),
    autoStartFocus: z.boolean(),
    soundEnabled: z.boolean(),
    soundVolume: int(LIMITS.soundVolume),
    notificationsEnabled: z.boolean(),
    showTimerInTitle: z.boolean(),
    dayStartHour: int(LIMITS.dayStartHour),
    weekStartsOn: z.union([z.literal(1), z.literal(7)]),
    theme: z.enum(['system', 'light', 'dark']),
  })
  .partial();

const dataSchema = z.object({
  tasks: z.array(taskSchema).superRefine(uniqueIds),
  projects: z
    .array(projectSchema)
    .max(LIMITS.maxProjects, `${LIMITS.maxProjects}개 초과`)
    .superRefine(uniqueIds)
    .superRefine(uniqueNames),
  tags: z
    .array(tagSchema)
    .max(LIMITS.maxTags, `${LIMITS.maxTags}개 초과`)
    .superRefine(uniqueIds)
    .superRefine(uniqueNames),
  habits: z.array(habitSchema).superRefine(uniqueIds),
  habitLogs: z.array(habitLogSchema).superRefine(uniqueIds),
  focusSessions: z.array(focusSessionSchema).superRefine(uniqueIds),
  settings: settingsSchema,
});

// ---- 버전 마이그레이션 ----

/** fromVersion의 `data`를 fromVersion+1 형태로 바꾼다. 현재는 v1만 있어 비어 있다. */
type Migration = (data: unknown) => unknown;
const MIGRATIONS: Record<number, Migration> = {};

/** 낮은 버전의 data를 현재 형식으로 올린다. 올릴 방법이 없으면 null. */
export function migrateBackupData(data: unknown, fromVersion: number): unknown {
  let current = data;
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    current = step(current);
  }
  return current;
}

// ---- 불러오기: 파싱·검증·정리 ----

export type ParseBackupResult =
  | {
      ok: true;
      data: BackupData;
      exportedAt: EpochMs;
      counts: BackupCounts;
      cleanup: CleanupReport;
    }
  | { ok: false; errors: string[]; omitted: number };

function fail(...errors: string[]): ParseBackupResult {
  return { ok: false, errors, omitted: 0 };
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path
    .filter((_, i) => !(i === 0 && issue.path[0] === 'data'))
    .reduce<string>((acc, part) => {
      if (typeof part === 'number') return `${acc}[${part}]`;
      return acc ? `${acc}.${String(part)}` : String(part);
    }, '');
  const where = path || '파일';
  let reason: string;
  switch (issue.code) {
    case 'invalid_type':
      reason = issue.message.includes('received undefined')
        ? '필수 항목이 없음'
        : '값의 형식이 올바르지 않음';
      break;
    case 'too_big':
      reason =
        issue.origin === 'array'
          ? `${String(issue.maximum)}개 초과`
          : `${String(issue.maximum)} 초과`;
      break;
    case 'too_small':
      reason =
        issue.origin === 'array'
          ? `${String(issue.minimum)}개 미만`
          : `${String(issue.minimum)} 미만`;
      break;
    case 'invalid_value':
      reason = '허용되지 않는 값';
      break;
    case 'invalid_union':
      reason = '형식이 올바르지 않음';
      break;
    default:
      reason = issue.message;
  }
  return `${where}: ${reason}`;
}

function countsOf(data: BackupData): BackupCounts {
  return {
    tasks: data.tasks.length,
    projects: data.projects.length,
    tags: data.tags.length,
    habits: data.habits.length,
    habitLogs: data.habitLogs.length,
    focusSessions: data.focusSessions.length,
  };
}

/** 없는 projectId→null, 없는 tagId 제거, 없는 습관의 기록 삭제. 입력은 바꾸지 않는다. */
export function cleanReferences(data: BackupData): { data: BackupData; report: CleanupReport } {
  const projectIds = new Set(data.projects.map((p) => p.id));
  const tagIds = new Set(data.tags.map((t) => t.id));
  const habitIds = new Set(data.habits.map((h) => h.id));
  const report: CleanupReport = { taskProjectCleared: 0, taskTagsRemoved: 0, habitLogsRemoved: 0 };

  const tasks = data.tasks.map((task) => {
    let next = task;
    if (task.projectId !== null && !projectIds.has(task.projectId)) {
      report.taskProjectCleared += 1;
      next = { ...next, projectId: null };
    }
    const keptTags = task.tagIds.filter((tagId) => tagIds.has(tagId));
    if (keptTags.length !== task.tagIds.length) {
      report.taskTagsRemoved += task.tagIds.length - keptTags.length;
      next = { ...next, tagIds: keptTags };
    }
    return next;
  });

  const habitLogs = data.habitLogs.filter((log) => habitIds.has(log.habitId));
  report.habitLogsRemoved = data.habitLogs.length - habitLogs.length;

  return { data: { ...data, tasks, habitLogs }, report };
}

/** 파일 내용(JSON 문자열)을 검증하고 참조를 정리한다. 아무것도 저장하지 않는다. */
export function parseBackup(content: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return fail('JSON 형식이 아니에요. 하루틴에서 내보낸 백업 파일이 맞는지 확인해 주세요.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('하루틴 백업 파일이 아니에요.');
  }
  const file = raw as Record<string, unknown>;
  if (file.app !== BACKUP_APP_ID) return fail('하루틴 백업 파일이 아니에요.');

  const version = file.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('백업 파일의 버전을 읽을 수 없어요.');
  }
  if (version > SCHEMA_VERSION) return fail('더 새 버전에서 만든 백업이에요.');

  const data = version < SCHEMA_VERSION ? migrateBackupData(file.data, version) : file.data;
  if (data === null) return fail('이 버전의 백업은 불러올 수 없어요.');

  const exportedAt = epoch.safeParse(file.exportedAt);
  if (!exportedAt.success) return fail('exportedAt: 내보낸 시각이 올바르지 않음');

  const parsed = dataSchema.safeParse(data);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => describeIssue(issue));
    return {
      ok: false,
      errors: messages.slice(0, MAX_SHOWN_ERRORS),
      omitted: Math.max(0, messages.length - MAX_SHOWN_ERRORS),
    };
  }

  const cleaned = cleanReferences(parsed.data as BackupData);
  return {
    ok: true,
    data: cleaned.data,
    exportedAt: exportedAt.data,
    counts: countsOf(cleaned.data),
    cleanup: cleaned.report,
  };
}

// ---- 내보내기 ----

export function backupFileName(now: EpochMs): string {
  return `haruteen-backup-${fromDate(new Date(now))}.json`;
}

export async function buildBackup(now: EpochMs = Date.now()): Promise<BackupFile> {
  return db.transaction(
    'r',
    [db.tasks, db.projects, db.tags, db.habits, db.habitLogs, db.focusSessions, db.kv],
    async () => {
      const [tasks, projects, tags, habits, habitLogs, focusSessions, settings] = await Promise.all(
        [
          db.tasks.toArray(),
          db.projects.toArray(),
          db.tags.toArray(),
          db.habits.toArray(),
          db.habitLogs.toArray(),
          db.focusSessions.toArray(),
          getSettings(),
        ],
      );
      const settingsData: Partial<Settings> = { ...settings };
      delete settingsData.key;
      return {
        app: BACKUP_APP_ID,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: now,
        data: {
          tasks,
          projects,
          tags,
          habits,
          habitLogs,
          focusSessions,
          settings: settingsData,
        },
      };
    },
  );
}

/** 백업 내용과 파일명을 만든다. 파일을 내려받고 `recordBackup`을 부르는 것은 호출하는 쪽. */
export async function exportBackup(
  now: EpochMs = Date.now(),
): Promise<{ fileName: string; json: string }> {
  const backup = await buildBackup(now);
  return { fileName: backupFileName(now), json: JSON.stringify(backup) };
}

/** 백업 파일을 내려받은 뒤에 부른다. 내려받기가 실패했으면 부르지 않아 백업 알림이 그대로 남는다. */
export async function recordBackup(now: EpochMs = Date.now()): Promise<void> {
  await updateMeta({ lastBackupAt: now, backupReminderDismissedUntil: null });
}

// ---- 교체 · 전체 삭제 ----

function idleTimer(revision: number): TimerState {
  return { ...DEFAULT_TIMER_STATE, revision };
}

/** 타이머를 idle로 되돌린다. 다른 탭이 이전 상태로 쓰지 못하도록 revision은 올린다. */
async function resetTimer(): Promise<void> {
  const current = await getTimerState();
  await db.kv.put(idleTimer(current.revision + 1));
}

const ALL_TABLES = () => [
  db.tasks,
  db.projects,
  db.tags,
  db.habits,
  db.habitLogs,
  db.focusSessions,
  db.kv,
];

/**
 * 모든 데이터를 백업 내용으로 교체한다. 단일 트랜잭션이라 중간에 실패하면 기존 데이터가 그대로 남는다.
 * 타이머는 idle로 초기화하고, 백업 시각 메타(`lastBackupAt` 등)는 유지한다.
 */
export async function replaceAllData(data: BackupData): Promise<void> {
  await db.transaction('rw', ALL_TABLES(), async () => {
    await Promise.all([
      db.tasks.clear(),
      db.projects.clear(),
      db.tags.clear(),
      db.habits.clear(),
      db.habitLogs.clear(),
      db.focusSessions.clear(),
    ]);
    // bulkAdd: id가 겹치면 덮어쓰지 않고 실패해, 트랜잭션 전체가 롤백된다.
    await db.tasks.bulkAdd(data.tasks);
    await db.projects.bulkAdd(data.projects);
    await db.tags.bulkAdd(data.tags);
    await db.habits.bulkAdd(data.habits);
    await db.habitLogs.bulkAdd(data.habitLogs);
    await db.focusSessions.bulkAdd(data.focusSessions);
    await db.kv.put(mergeSettings(data.settings));
    await resetTimer();
  });
}

/** 설정·타이머·백업 시각을 포함한 모든 데이터를 지운다. */
export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', ALL_TABLES(), async () => {
    const timer = await getTimerState();
    await Promise.all(ALL_TABLES().map((table) => table.clear()));
    // 타이머 revision이 0으로 돌아가면 다른 탭의 이전 상태와 겹칠 수 있어 올려서 다시 만든다.
    await db.kv.put(idleTimer(timer.revision + 1));
  });
}

// ---- 구독 ----

/** 지울 만한 데이터(할 일·습관·프로젝트·태그·집중 기록)가 하나라도 있는지. 첫 조회 전에는 undefined. */
export function useHasData(): boolean | undefined {
  return useLiveQuery(async () => {
    const counts = await Promise.all([
      db.tasks.count(),
      db.habits.count(),
      db.projects.count(),
      db.tags.count(),
      db.focusSessions.count(),
    ]);
    return counts.some((n) => n > 0);
  }, []);
}
