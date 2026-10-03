// DESIGN.md §4.3 습관 규칙. 순수 함수이며 현재 시각 대신 "오늘"(LocalDate)을 인자로 받는다.
import { addDays, compareDates, diffDays, eachDay, isoWeekday, weekRange } from './dates';
import type { Habit, HabitGoal, HabitLog, LocalDate } from './types';

/** 한 습관의 날짜별 기록 값. 기록이 없는 날은 키가 없다. */
export type LogValues = ReadonlyMap<LocalDate, number>;

/** 오늘 기준 며칠 전까지 기록할 수 있는지. */
export const LOG_BACK_DAYS = 7;

export function toLogValues(logs: readonly HabitLog[]): Map<LocalDate, number> {
  return new Map(logs.map((log) => [log.date, log.value]));
}

/** 그날 달성으로 보는 값: check는 1, count는 target. */
export function goalValue(goal: HabitGoal): number {
  return goal.type === 'check' ? 1 : goal.target;
}

export function isAchievedValue(goal: HabitGoal, value: number): boolean {
  return value >= goalValue(goal);
}

function isAchievedOn(habit: Habit, logs: LogValues, date: LocalDate): boolean {
  return isAchievedValue(habit.goal, logs.get(date) ?? 0);
}

/** 시작일 이후이고 보관 전인 날. 일정과 무관하다. */
function isTrackedDate(habit: Habit, date: LocalDate): boolean {
  if (compareDates(date, habit.startDate) < 0) return false;
  return habit.archivedOn === null || compareDates(date, habit.archivedOn) < 0;
}

/**
 * 예정일 판정. weeklyCount는 예정일 개념 대신 매일 "기록 가능"이므로,
 * 시작일 이후이고 보관 전이기만 하면 true다.
 */
export function isScheduled(habit: Habit, date: LocalDate): boolean {
  if (!isTrackedDate(habit, date)) return false;
  if (habit.schedule.type === 'weekdays') return habit.schedule.days.includes(isoWeekday(date));
  return true;
}

export type Loggability = { ok: true } | { ok: false; reason: string };

/** 기록 가능 범위(오늘-7일 ≤ date ≤ 오늘, 예정일)인지. 막힌 이유를 함께 돌려준다. */
export function loggability(habit: Habit, date: LocalDate, today: LocalDate): Loggability {
  if (compareDates(date, today) > 0) return { ok: false, reason: '미래 날짜는 기록할 수 없어요.' };
  if (compareDates(date, addDays(today, -LOG_BACK_DAYS)) < 0) {
    return { ok: false, reason: `오늘 기준 ${LOG_BACK_DAYS}일 전까지만 기록할 수 있어요.` };
  }
  if (compareDates(date, habit.startDate) < 0) {
    return { ok: false, reason: '시작일 전이라 기록할 수 없어요.' };
  }
  if (habit.archivedOn !== null && compareDates(date, habit.archivedOn) >= 0) {
    return { ok: false, reason: '보관한 습관이라 기록할 수 없어요.' };
  }
  if (!isScheduled(habit, date)) return { ok: false, reason: '예정일이 아니라 기록할 수 없어요.' };
  return { ok: true };
}

/** 계산이 닿는 마지막 날: 오늘, 보관했다면 보관 전날 중 빠른 쪽. */
function lastTrackedDate(habit: Habit, today: LocalDate): LocalDate {
  if (habit.archivedOn === null) return today;
  const beforeArchive = addDays(habit.archivedOn, -1);
  return compareDates(beforeArchive, today) < 0 ? beforeArchive : today;
}

// ---- 주 단위(weeklyCount) ----

interface WeekStats {
  /** 시작일·보관일을 반영해 이 주에서 계산 대상인 날 수. 0이면 이 주는 대상이 아니다. */
  activeDays: number;
  /** 이 주의 요구 횟수 = min(count, activeDays). (시작 주·보관한 주 처리) */
  required: number;
  /** 이 주에 달성한 날 수(오늘까지) */
  achievedDays: number;
}

function weekStats(
  habit: Habit & { schedule: { type: 'weeklyCount'; count: number } },
  logs: LogValues,
  weekStart: LocalDate,
  today: LocalDate,
): WeekStats {
  const weekEnd = addDays(weekStart, 6);
  const from = compareDates(weekStart, habit.startDate) > 0 ? weekStart : habit.startDate;
  const lastDay = habit.archivedOn === null ? weekEnd : addDays(habit.archivedOn, -1);
  const to = compareDates(weekEnd, lastDay) < 0 ? weekEnd : lastDay;
  if (compareDates(from, to) > 0) return { activeDays: 0, required: 0, achievedDays: 0 };

  const activeDays = diffDays(from, to) + 1;
  const through = compareDates(to, today) < 0 ? to : today;
  const achievedDays = eachDay(from, through).filter((d) => isAchievedOn(habit, logs, d)).length;
  return { activeDays, required: Math.min(habit.schedule.count, activeDays), achievedDays };
}

function isWeeklyHabit(
  habit: Habit,
): habit is Habit & { schedule: { type: 'weeklyCount'; count: number } } {
  return habit.schedule.type === 'weeklyCount';
}

function isWeekAchieved(stats: WeekStats): boolean {
  return stats.activeDays > 0 && stats.achievedDays >= stats.required;
}

// ---- 연속 기록 ----

export interface Streak {
  /** daily·weekdays는 일, weeklyCount는 주 */
  unit: 'day' | 'week';
  current: number;
  best: number;
}

function dayStreak(habit: Habit, logs: LogValues, today: LocalDate): Streak {
  const last = lastTrackedDate(habit, today);

  let current = 0;
  let d = last;
  // 오늘이 예정일인데 아직 달성 전이면 끊긴 것으로 보지 않고 어제부터 센다.
  if (d === today && isScheduled(habit, d) && !isAchievedOn(habit, logs, d)) d = addDays(d, -1);
  for (; compareDates(d, habit.startDate) >= 0; d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    if (!isAchievedOn(habit, logs, d)) break;
    current++;
  }

  let best = 0;
  let run = 0;
  for (const date of eachDay(habit.startDate, last)) {
    if (!isScheduled(habit, date)) continue;
    run = isAchievedOn(habit, logs, date) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { unit: 'day', current, best };
}

function weekStreak(
  habit: Habit & { schedule: { type: 'weeklyCount'; count: number } },
  logs: LogValues,
  today: LocalDate,
  weekStartsOn: 1 | 7,
): Streak {
  const firstWeek = weekRange(habit.startDate, weekStartsOn).from;
  const thisWeek = weekRange(today, weekStartsOn).from;

  let current = 0;
  for (let ws = thisWeek; compareDates(ws, firstWeek) >= 0; ws = addDays(ws, -7)) {
    const stats = weekStats(habit, logs, ws, today);
    if (stats.activeDays === 0) continue; // 보관한 뒤의 주
    if (isWeekAchieved(stats)) current++;
    else if (ws !== thisWeek) break; // 이번 주 미달성은 끊긴 것으로 보지 않는다
  }

  let best = 0;
  let run = 0;
  const lastWeek = weekRange(lastTrackedDate(habit, today), weekStartsOn).from;
  for (let ws = firstWeek; compareDates(ws, lastWeek) <= 0; ws = addDays(ws, 7)) {
    const stats = weekStats(habit, logs, ws, today);
    if (stats.activeDays === 0) continue;
    run = isWeekAchieved(stats) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { unit: 'week', current, best };
}

/** 현재·최고 연속 기록. */
export function streak(
  habit: Habit,
  logs: LogValues,
  today: LocalDate,
  weekStartsOn: 1 | 7,
): Streak {
  return isWeeklyHabit(habit)
    ? weekStreak(habit, logs, today, weekStartsOn)
    : dayStreak(habit, logs, today);
}

// ---- 달성률 ----

export interface Rate {
  /** 분자 */
  done: number;
  /** 분모 */
  total: number;
  /** 0~1. 분모가 0이면 null("기록 없음", 0%와 구분) */
  rate: number | null;
}

function makeRate(done: number, total: number): Rate {
  return { done, total, rate: total === 0 ? null : done / total };
}

/**
 * 달성률. to는 오늘을 넘으면 오늘로 맞춘다.
 *
 * - daily/weekdays: 범위 안 예정일 중 달성일. 오늘이 미달성이면 분모에서 뺀다.
 * - weeklyCount: 마지막 날이 범위 안인 주만 센다. 분모 = Σ 요구 횟수, 분자 = Σ min(달성일, 요구 횟수).
 *   이번 주(오늘이 든 주)는 달성했을 때만 센다. 오늘이 미달성이면 뺀다는 일 단위 규칙과 같은 취지다.
 */
export function achievementRate(
  habit: Habit,
  logs: LogValues,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  weekStartsOn: 1 | 7,
): Rate {
  const end = compareDates(to, today) < 0 ? to : today;

  if (!isWeeklyHabit(habit)) {
    let done = 0;
    let total = 0;
    const start = compareDates(from, habit.startDate) > 0 ? from : habit.startDate;
    for (const date of eachDay(start, end)) {
      if (!isScheduled(habit, date)) continue;
      const achieved = isAchievedOn(habit, logs, date);
      if (date === today && !achieved) continue;
      total++;
      if (achieved) done++;
    }
    return makeRate(done, total);
  }

  let done = 0;
  let total = 0;
  for (
    let ws = weekRange(from, weekStartsOn).from;
    compareDates(ws, end) <= 0;
    ws = addDays(ws, 7)
  ) {
    const weekEnd = addDays(ws, 6);
    const isThisWeek =
      end === today && compareDates(ws, today) <= 0 && compareDates(today, weekEnd) <= 0;
    if (!isThisWeek && compareDates(weekEnd, end) > 0) continue; // 아직 끝나지 않은 주
    const stats = weekStats(habit, logs, ws, today);
    if (stats.activeDays === 0) continue;
    if (isThisWeek && !isWeekAchieved(stats)) continue;
    total += stats.required;
    done += Math.min(stats.achievedDays, stats.required);
  }
  return makeRate(done, total);
}

// ---- 오늘 화면 · 습관 상세 ----

/** 오늘 화면에 보여 줄 습관: 오늘 예정인 활성 습관(weeklyCount는 매일 포함). 입력 순서를 유지한다. */
export function habitsForToday(habits: readonly Habit[], today: LocalDate): Habit[] {
  return habits.filter((h) => h.archivedOn === null && isScheduled(h, today));
}

export interface WeeklyProgress {
  /** 이번 주 달성일 수(요구 횟수를 넘으면 요구 횟수로 맞춘다) */
  done: number;
  required: number;
}

/** weeklyCount 습관의 이번 주 진행. 다른 일정이면 null. */
export function weeklyProgress(
  habit: Habit,
  logs: LogValues,
  today: LocalDate,
  weekStartsOn: 1 | 7,
): WeeklyProgress | null {
  if (!isWeeklyHabit(habit)) return null;
  const stats = weekStats(habit, logs, weekRange(today, weekStartsOn).from, today);
  return { done: Math.min(stats.achievedDays, stats.required), required: stats.required };
}

export type DayStatusKind =
  | 'future' // 오늘 이후
  | 'untracked' // 시작 전·보관 후
  | 'blank' // 주 N회 습관에서 기록이 없는 날 (예정일 개념이 없다)
  | 'off' // 예정일이 아님
  | 'missed' // 미달성 예정일
  | 'partial' // 횟수형 일부 달성
  | 'done';

export interface DayStatus {
  kind: DayStatusKind;
  /** partial일 때 농도 단계: 1(1~33%) 2(34~66%) 3(67~99%) */
  level?: 1 | 2 | 3;
  value: number;
}

/** 히트맵 한 칸의 상태. */
export function dayStatus(
  habit: Habit,
  logs: LogValues,
  date: LocalDate,
  today: LocalDate,
): DayStatus {
  const value = logs.get(date) ?? 0;
  if (compareDates(date, today) > 0) return { kind: 'future', value };
  if (!isTrackedDate(habit, date)) return { kind: 'untracked', value };
  if (isAchievedValue(habit.goal, value)) return { kind: 'done', value };
  if (habit.goal.type === 'count' && value > 0) {
    const percent = Math.floor((value / habit.goal.target) * 100);
    return { kind: 'partial', level: percent <= 33 ? 1 : percent <= 66 ? 2 : 3, value };
  }
  // 주 N회 습관은 예정일이 없으니 못 채운 날도 "미달성"으로 그리지 않고 빈 칸으로 둔다.
  if (habit.schedule.type === 'weeklyCount') return { kind: 'blank', value };
  return { kind: isScheduled(habit, date) ? 'missed' : 'off', value };
}

/** 최근 `weeks`주(기본 53)의 날짜. 열 = 주(오래된 순), 행 = 요일(weekStartsOn부터). 마지막 열은 오늘이 든 주. */
export function heatmapWeeks(today: LocalDate, weekStartsOn: 1 | 7, weeks = 53): LocalDate[][] {
  const first = addDays(weekRange(today, weekStartsOn).from, -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => {
    const start = addDays(first, 7 * w);
    return eachDay(start, addDays(start, 6));
  });
}
