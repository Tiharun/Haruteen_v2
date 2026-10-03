import { useLiveQuery } from 'dexie-react-hooks';
import { isAchievedValue, loggability } from '../../domain/habits';
import type { HabitLog, ID, LocalDate } from '../../domain/types';
import { LIMITS, unwrap, validateHabitLogValue, ValidationError } from '../../domain/validation';
import { db } from '../db';

export function habitLogId(habitId: ID, date: LocalDate): string {
  return `${habitId}:${date}`;
}

/**
 * 한 날의 기록 값을 정한다. 값 0이면 기록을 지운다.
 * 기록 가능 범위(오늘-7일~오늘, 예정일) 밖이면 ValidationError. 습관이 이미 없으면 null.
 * 체크형은 0보다 큰 값을 모두 1로 저장한다.
 */
export async function setHabitLog(
  habitId: ID,
  date: LocalDate,
  value: number,
  today: LocalDate,
  now: number = Date.now(),
): Promise<HabitLog | null> {
  unwrap(validateHabitLogValue(value));
  return db.transaction('rw', db.habits, db.habitLogs, async () => {
    const habit = await db.habits.get(habitId);
    if (!habit) return null;
    const allowed = loggability(habit, date, today);
    if (!allowed.ok) throw new ValidationError(allowed.reason);

    const id = habitLogId(habitId, date);
    const stored = habit.goal.type === 'check' && value > 0 ? 1 : value;
    if (stored === 0) {
      await db.habitLogs.delete(id);
      return null;
    }
    const log: HabitLog = { id, habitId, date, value: stored, updatedAt: now };
    await db.habitLogs.put(log);
    return log;
  });
}

/** 체크형 토글: 달성 상태면 기록을 지우고, 아니면 1로 기록한다. */
export async function toggleHabitLog(
  habitId: ID,
  date: LocalDate,
  today: LocalDate,
  now: number = Date.now(),
): Promise<HabitLog | null> {
  return db.transaction('rw', db.habits, db.habitLogs, async () => {
    const habit = await db.habits.get(habitId);
    if (!habit) return null;
    if (habit.goal.type !== 'check') {
      throw new ValidationError('체크형 습관만 눌러서 바꿀 수 있어요.');
    }
    const existing = await db.habitLogs.get(habitLogId(habitId, date));
    const done = existing !== undefined && isAchievedValue(habit.goal, existing.value);
    return setHabitLog(habitId, date, done ? 0 : 1, today, now);
  });
}

/** 횟수형 +1/−1. 0 아래로는 내려가지 않고, 9,999를 넘으면 ValidationError. */
export async function adjustHabitLog(
  habitId: ID,
  date: LocalDate,
  delta: number,
  today: LocalDate,
  now: number = Date.now(),
): Promise<HabitLog | null> {
  return db.transaction('rw', db.habits, db.habitLogs, async () => {
    const existing = await db.habitLogs.get(habitLogId(habitId, date));
    const next = Math.max(LIMITS.habitLogValue.min, (existing?.value ?? 0) + delta);
    return setHabitLog(habitId, date, next, today, now);
  });
}

/**
 * 집중을 마친 뒤 "습관도 체크할까요?"에서 쓴다. 체크형은 달성으로 기록하고(이미 달성이면 그대로),
 * 횟수형은 1 늘린다. 습관이 이미 없으면 null. 오늘 기록할 수 없는 습관이면 ValidationError.
 */
export async function recordHabitProgress(
  habitId: ID,
  today: LocalDate,
  now: number = Date.now(),
): Promise<HabitLog | null> {
  return db.transaction('rw', db.habits, db.habitLogs, async () => {
    const habit = await db.habits.get(habitId);
    if (!habit) return null;
    if (habit.goal.type === 'check') return setHabitLog(habitId, today, 1, today, now);
    return adjustHabitLog(habitId, today, 1, today, now);
  });
}

/** 모든 기록. 연속·달성률 계산이 시작일까지 거슬러 가므로 기간을 자르지 않는다. */
export function useHabitLogsQuery(): HabitLog[] | undefined {
  return useLiveQuery(() => db.habitLogs.toArray(), []);
}

/** 한 습관의 모든 기록. 첫 조회가 끝나기 전에는 undefined. */
export function useHabitLogsOf(habitId: ID): HabitLog[] | undefined {
  return useLiveQuery(() => db.habitLogs.where('habitId').equals(habitId).toArray(), [habitId]);
}
