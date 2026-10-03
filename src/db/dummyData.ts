// 개발 모드 전용: 성능 확인용 더미 데이터 (DESIGN.md §10 규모: 할 일 2천, 기록 5천, 세션 3천).
import { addDays, todayOf } from '../domain/dates';
import type {
  ColorKey,
  FocusSession,
  Habit,
  HabitLog,
  Priority,
  Project,
  Tag,
  Task,
} from '../domain/types';
import { db } from './db';

export const DUMMY_COUNTS = { tasks: 2000, habitLogs: 5000, focusSessions: 3000 } as const;

const COLORS: ColorKey[] = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const HABIT_COUNT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const pick = <T>(items: readonly T[], index: number): T => items[index % items.length] as T;

/** 기존 데이터는 그대로 두고 더미 데이터를 추가한다. */
export async function insertDummyData(now: number = Date.now(), dayStartHour = 0): Promise<void> {
  const today = todayOf(now, dayStartHour);
  const batch = crypto.randomUUID().slice(0, 8);

  const projects: Project[] = Array.from({ length: 5 }, (_, i) => ({
    id: `dummy-${batch}-p${i}`,
    name: `더미 프로젝트 ${batch}-${i + 1}`.slice(0, 30),
    color: pick(COLORS, i),
    order: 1000 + i,
    createdAt: now,
  }));
  const tags: Tag[] = Array.from({ length: 8 }, (_, i) => ({
    id: `dummy-${batch}-g${i}`,
    name: `더미 태그 ${batch}-${i + 1}`.slice(0, 30),
    color: pick(COLORS, i + 3),
    createdAt: now,
  }));

  const tasks: Task[] = Array.from({ length: DUMMY_COUNTS.tasks }, (_, i) => {
    const done = i % 4 !== 0;
    const created = now - ((i * 7) % 365) * DAY_MS;
    return {
      id: `dummy-${batch}-t${i}`,
      title: `더미 할 일 ${i + 1}`,
      note: i % 5 === 0 ? '메모 내용입니다. '.repeat(10).trim() : '',
      priority: pick(PRIORITIES, i),
      dueDate: i % 3 === 0 ? null : addDays(today, (i % 60) - 30),
      projectId: i % 2 === 0 ? pick(projects, i).id : null,
      tagIds: i % 3 === 0 ? [pick(tags, i).id, pick(tags, i + 1).id] : [],
      subtasks: i % 6 === 0 ? [{ id: `dummy-${batch}-s${i}`, title: '하위 할 일', done }] : [],
      status: done ? 'done' : 'todo',
      completedAt: done ? created + 3_600_000 : null,
      createdAt: created,
      updatedAt: created,
    };
  });

  const habits: Habit[] = Array.from({ length: HABIT_COUNT }, (_, i) => ({
    id: `dummy-${batch}-h${i}`,
    name: `더미 습관 ${i + 1}`,
    note: '',
    color: pick(COLORS, i),
    emoji: null,
    schedule: i % 3 === 0 ? { type: 'daily' } : { type: 'weekdays', days: [1, 2, 3, 4, 5] },
    goal: i % 2 === 0 ? { type: 'check' } : { type: 'count', target: 8, unit: '회' },
    startDate: addDays(today, -520),
    archivedOn: null,
    order: 1000 + i,
    createdAt: now,
    updatedAt: now,
  }));

  const habitLogs: HabitLog[] = [];
  for (let offset = 0; habitLogs.length < DUMMY_COUNTS.habitLogs; offset++) {
    for (const habit of habits) {
      if (habitLogs.length >= DUMMY_COUNTS.habitLogs) break;
      const date = addDays(today, -offset);
      habitLogs.push({
        id: `${habit.id}:${date}`,
        habitId: habit.id,
        date,
        value:
          habit.goal.type === 'count' ? 1 + ((offset + habitLogs.length) % habit.goal.target) : 1,
        updatedAt: now,
      });
    }
  }

  const focusSessions: FocusSession[] = Array.from(
    { length: DUMMY_COUNTS.focusSessions },
    (_, i) => {
      const startedAt = now - Math.floor((i * 3) / 25) * DAY_MS - (i % 25) * 3_600_000;
      const task = pick(tasks, i * 11);
      return {
        id: `dummy-${batch}-f${i}`,
        target: { type: 'task', id: task.id, titleSnapshot: task.title },
        targetId: task.id,
        startedAt,
        endedAt: startedAt + 1_500_000,
        plannedMs: 1_500_000,
        actualMs: 1_500_000,
        completed: true,
      };
    },
  );

  await db.transaction(
    'rw',
    [db.tasks, db.projects, db.tags, db.habits, db.habitLogs, db.focusSessions],
    async () => {
      await db.projects.bulkPut(projects);
      await db.tags.bulkPut(tags);
      await db.habits.bulkPut(habits);
      await db.tasks.bulkPut(tasks);
      await db.habitLogs.bulkPut(habitLogs);
      await db.focusSessions.bulkPut(focusSessions);
    },
  );
}
