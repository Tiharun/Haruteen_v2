import { useLiveQuery } from 'dexie-react-hooks';
import type { ColorKey, Habit, HabitGoal, HabitSchedule, ID, LocalDate } from '../../domain/types';
import {
  unwrap,
  validateHabitEmoji,
  validateHabitGoal,
  validateHabitName,
  validateHabitNote,
  validateHabitSchedule,
  validateHabitStartDate,
} from '../../domain/validation';
import { db } from '../db';

export interface HabitInput {
  name: string;
  note: string;
  color: ColorKey;
  emoji: string | null;
  schedule: HabitSchedule;
  goal: HabitGoal;
  startDate: LocalDate;
}

/** 입력을 검증하고 저장 형태로 정리한다. startDate는 호출하는 쪽이 따로 확인한다. */
function normalizeInput(input: HabitInput): HabitInput {
  return {
    name: unwrap(validateHabitName(input.name)),
    note: unwrap(validateHabitNote(input.note)),
    color: input.color,
    emoji: unwrap(validateHabitEmoji(input.emoji)),
    schedule: unwrap(validateHabitSchedule(input.schedule)),
    goal: unwrap(validateHabitGoal(input.goal)),
    startDate: input.startDate,
  };
}

/** 새 습관을 맨 뒤에 만든다. today는 시작일 범위(±365일) 확인에 쓴다. */
export async function createHabit(
  input: HabitInput,
  today: LocalDate,
  now: number = Date.now(),
): Promise<Habit> {
  const valid = normalizeInput(input);
  unwrap(validateHabitStartDate(valid.startDate, today));
  return db.transaction('rw', db.habits, async () => {
    const all = await db.habits.toArray();
    const habit: Habit = {
      id: crypto.randomUUID(),
      ...valid,
      archivedOn: null,
      order: all.reduce((max, h) => Math.max(max, h.order), -1) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.habits.add(habit);
    return habit;
  });
}

/**
 * 습관을 수정한다. 기록은 건드리지 않으므로 일정·목표를 바꾸면 과거 계산만 달라진다.
 * 시작일은 바뀐 경우에만 범위(±365일)를 확인한다. 이미 있던 오래된 시작일 때문에 저장이 막히면 안 된다.
 * 이미 삭제된 습관이면 아무것도 하지 않고 null.
 */
export async function updateHabit(
  id: ID,
  input: HabitInput,
  today: LocalDate,
  now: number = Date.now(),
): Promise<Habit | null> {
  const valid = normalizeInput(input);
  return db.transaction('rw', db.habits, async () => {
    const current = await db.habits.get(id);
    if (!current) return null;
    if (valid.startDate !== current.startDate) {
      unwrap(validateHabitStartDate(valid.startDate, today));
    }
    const next: Habit = { ...current, ...valid, updatedAt: now };
    await db.habits.put(next);
    return next;
  });
}

/** 보관: archivedOn=오늘. 그날부터 계산 대상이 아니다. */
export async function archiveHabit(
  id: ID,
  today: LocalDate,
  now: number = Date.now(),
): Promise<Habit | null> {
  return db.transaction('rw', db.habits, async () => {
    const current = await db.habits.get(id);
    if (!current) return null;
    const next: Habit = { ...current, archivedOn: today, updatedAt: now };
    await db.habits.put(next);
    return next;
  });
}

export async function restoreHabit(id: ID, now: number = Date.now()): Promise<Habit | null> {
  return db.transaction('rw', db.habits, async () => {
    const current = await db.habits.get(id);
    if (!current) return null;
    const next: Habit = { ...current, archivedOn: null, updatedAt: now };
    await db.habits.put(next);
    return next;
  });
}

/**
 * 같은 목록(진행 중 또는 보관함) 안에서 한 칸 위(-1)·아래(+1)로 옮긴다.
 * 이웃과 order 값을 맞바꾼다. 이미 끝이거나 없는 습관이면 아무 일도 없다.
 */
export async function moveHabit(id: ID, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    const all = await db.habits.orderBy('order').toArray();
    const current = all.find((h) => h.id === id);
    if (!current) return;
    const archived = current.archivedOn !== null;
    const siblings = all.filter((h) => (h.archivedOn !== null) === archived);
    const neighbor = siblings[siblings.findIndex((h) => h.id === id) + direction];
    if (!neighbor) return;
    await db.habits.update(current.id, { order: neighbor.order });
    await db.habits.update(neighbor.id, { order: current.order });
  });
}

/** 습관과 그 기록 전부를 한 트랜잭션으로 지운다. 집중 세션은 남긴다. */
export async function deleteHabit(id: ID): Promise<void> {
  await db.transaction('rw', db.habits, db.habitLogs, async () => {
    await db.habitLogs.where('habitId').equals(id).delete();
    await db.habits.delete(id);
  });
}

/** 보관한 습관도 포함해 order 순으로. 첫 조회가 끝나기 전에는 undefined. */
export function useHabitsQuery(): Habit[] | undefined {
  return useLiveQuery(() => db.habits.orderBy('order').toArray(), []);
}
