import Dexie, { type EntityTable } from 'dexie';
import type {
  FocusSession,
  Habit,
  HabitLog,
  Meta,
  Project,
  Settings,
  Tag,
  Task,
  TimerState,
} from '../domain/types';

export type KvRecord = Settings | TimerState | Meta;

export class HaruteenDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  habitLogs!: EntityTable<HabitLog, 'id'>;
  focusSessions!: EntityTable<FocusSession, 'id'>;
  kv!: EntityTable<KvRecord, 'key'>;

  constructor(name = 'haruteen') {
    super(name);
    // 스키마 변경은 version(n).upgrade()로만 한다. 기존 버전 정의는 지우지 않는다. (DESIGN.md §3.6)
    this.version(1).stores({
      tasks: 'id, status, dueDate, projectId, *tagIds, createdAt, completedAt',
      projects: 'id, order',
      tags: 'id',
      habits: 'id, order',
      habitLogs: 'id, habitId, date, [habitId+date]',
      focusSessions: 'id, startedAt, targetId',
      kv: 'key',
    });
  }
}

export const db = new HaruteenDB();

/** DB를 열어 본다. 사생활 보호 모드·저장소 차단 등으로 실패하면 reject. */
export function openDatabase(): Promise<void> {
  return db.open().then(() => undefined);
}
