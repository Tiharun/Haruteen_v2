// DESIGN.md §4.5 통계 집계. 순수 함수이며 현재 시각 대신 "오늘"(LocalDate)과 dayStartHour를 인자로 받는다.
import {
  addDays,
  addMonths,
  compareDates,
  dayRangeMs,
  diffDays,
  eachDay,
  formatDateShort,
  makeLocalDate,
  monthRange,
  todayOf,
  toDate,
  weekRange,
  yearRange,
} from './dates';
import { achievementRate, streak, type Streak, type LogValues } from './habits';
import { isOverdue } from './tasks';
import type { FocusSession, Habit, HabitLog, LocalDate, Priority, Task } from './types';

// ---- 기간 ----

export type StatsUnit = 'week' | 'month' | 'year';

export interface StatsPeriod {
  unit: StatsUnit;
  /** 기간의 첫날·마지막 날(포함). 마지막 날이 미래여도 그대로 둔다. */
  from: LocalDate;
  to: LocalDate;
}

/** anchor(기간 안의 아무 날짜)가 속한 주·월·연. */
export function periodOf(anchor: LocalDate, unit: StatsUnit, weekStartsOn: 1 | 7): StatsPeriod {
  const range =
    unit === 'week'
      ? weekRange(anchor, weekStartsOn)
      : unit === 'month'
        ? monthRange(anchor)
        : yearRange(anchor);
  return { unit, ...range };
}

/** 이전(-1)·다음(+1) 기간의 anchor. 월은 1일로 맞춰 말일 넘침을 피한다. */
export function shiftAnchor(anchor: LocalDate, unit: StatsUnit, direction: -1 | 1): LocalDate {
  if (unit === 'week') return addDays(anchor, 7 * direction);
  const first = monthRange(anchor).from;
  return addMonths(first, (unit === 'month' ? 1 : 12) * direction);
}

/** 집계에 쓰는 마지막 날: 기간 끝과 오늘 중 빠른 쪽. 기간 전체가 미래이면 from보다 앞선다. */
export function effectiveEnd(period: StatsPeriod, today: LocalDate): LocalDate {
  return compareDates(period.to, today) < 0 ? period.to : today;
}

export function isFuturePeriod(period: StatsPeriod, today: LocalDate): boolean {
  return compareDates(period.from, today) > 0;
}

export function containsDate(period: StatsPeriod, date: LocalDate): boolean {
  return compareDates(date, period.from) >= 0 && compareDates(date, period.to) <= 0;
}

/** 기간 안에서 지나간 날 수(오늘 포함). 미래 기간은 0. */
export function elapsedDays(period: StatsPeriod, today: LocalDate): number {
  const end = effectiveEnd(period, today);
  return Math.max(0, diffDays(period.from, end) + 1);
}

/** 기간 전체를 덮는 시각 범위 [startMs, endMs). 집중 세션 조회용. */
export function periodRangeMs(
  period: StatsPeriod,
  dayStartHour: number,
): { start: number; end: number } {
  return {
    start: dayRangeMs(period.from, dayStartHour).start,
    end: dayRangeMs(period.to, dayStartHour).end,
  };
}

export function formatPeriodLabel(period: StatsPeriod): string {
  const year = toDate(period.from).getFullYear();
  if (period.unit === 'year') return `${year}년`;
  if (period.unit === 'month') return `${year}년 ${toDate(period.from).getMonth() + 1}월`;
  // 연말 주나 지난해로 이동했을 때 몇 년도인지 알 수 있게 연도를 붙인다. 해가 바뀌면 끝 날짜에도 붙인다.
  const toYear = toDate(period.to).getFullYear();
  const end = toYear === year ? '' : `${toYear}년 `;
  return `${year}년 ${formatDateShort(period.from)} ~ ${end}${formatDateShort(period.to)}`;
}

// ---- 표시 형식 ----

/** 예: `1시간 25분`, `2시간`, `45분`, 1분 미만은 `1분 미만`(0이면 `0분`). */
export function formatFocusTime(ms: number): string {
  if (ms <= 0) return '0분';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return '1분 미만';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 소수점 없이 반올림한 `%`. 분모 0(null)은 `기록 없음`. */
export function formatPercent(rate: number | null): string {
  return rate === null ? '기록 없음' : `${Math.round(rate * 100)}%`;
}

// ---- 집중 ----

export interface FocusBucket {
  /** 막대 하나의 첫날(일별) 또는 그 달의 1일(월별) */
  key: LocalDate;
  /** 축 라벨: 일별은 날짜(일), 월별은 `n월` */
  label: string;
  /** 집중 시간. 아직 오지 않은 날·달은 null(0이 아니라 비어 있음) */
  ms: number | null;
}

export interface TargetRow {
  key: string;
  kind: 'target' | 'other' | 'none';
  label: string;
  type?: 'task' | 'habit';
  /** 대상 행일 때 할 일·습관 id. 지워졌는지 화면에서 확인하는 데 쓴다. */
  targetId?: string;
  ms: number;
}

export interface FocusStats {
  totalMs: number;
  completedCount: number;
  /** 총 집중 시간 / 기간 내 지나간 날 수. 지나간 날이 없으면 0 */
  averagePerDayMs: number;
  buckets: FocusBucket[];
  /** 대상별 상위 5 + 기타, 마지막에 대상 없음. 시간이 0인 행은 넣지 않는다. */
  targets: TargetRow[];
}

export const TOP_TARGETS = 5;

/** 세션이 속한 날 = startedAt이 속한 날(자정을 넘겨도 시작한 날). */
export function sessionDate(session: FocusSession, dayStartHour: number): LocalDate {
  return todayOf(session.startedAt, dayStartHour);
}

function bucketKeys(period: StatsPeriod): { key: LocalDate; label: string }[] {
  if (period.unit === 'year') {
    const year = toDate(period.from).getFullYear();
    return Array.from({ length: 12 }, (_, i) => ({
      key: makeLocalDate(year, i + 1, 1),
      label: `${i + 1}월`,
    }));
  }
  return eachDay(period.from, period.to).map((date) => ({
    key: date,
    label: String(toDate(date).getDate()),
  }));
}

export function focusStats(
  sessions: readonly FocusSession[],
  period: StatsPeriod,
  today: LocalDate,
  dayStartHour: number,
): FocusStats {
  const end = effectiveEnd(period, today);
  const inRange = sessions.filter((s) => {
    const date = sessionDate(s, dayStartHour);
    return compareDates(date, period.from) >= 0 && compareDates(date, end) <= 0;
  });

  const totalMs = inRange.reduce((sum, s) => sum + s.actualMs, 0);
  const days = elapsedDays(period, today);

  const bucketMs = new Map<LocalDate, number>();
  for (const s of inRange) {
    const date = sessionDate(s, dayStartHour);
    const key = period.unit === 'year' ? monthRange(date).from : date;
    bucketMs.set(key, (bucketMs.get(key) ?? 0) + s.actualMs);
  }
  const buckets = bucketKeys(period).map(({ key, label }) => ({
    key,
    label,
    // 그 막대가 시작하는 날이 오늘보다 뒤면 아직 오지 않은 것
    ms: compareDates(key, today) > 0 ? null : (bucketMs.get(key) ?? 0),
  }));

  // 대상별 합계. 대상이 삭제돼도 남아 있는 이름(titleSnapshot)을 쓰고, 가장 최근 세션의 이름을 따른다.
  const byTarget = new Map<string, TargetRow & { latest: number }>();
  let noneMs = 0;
  for (const s of inRange) {
    if (s.target === null) {
      noneMs += s.actualMs;
      continue;
    }
    const key = `${s.target.type}:${s.target.id}`;
    const row = byTarget.get(key);
    if (row) {
      row.ms += s.actualMs;
      if (s.startedAt > row.latest) {
        row.latest = s.startedAt;
        row.label = s.target.titleSnapshot;
      }
    } else {
      byTarget.set(key, {
        key,
        kind: 'target',
        label: s.target.titleSnapshot,
        type: s.target.type,
        targetId: s.target.id,
        ms: s.actualMs,
        latest: s.startedAt,
      });
    }
  }
  const ranked = [...byTarget.values()]
    .filter((row) => row.ms > 0)
    .sort((a, b) => b.ms - a.ms || a.key.localeCompare(b.key));
  const targets: TargetRow[] = ranked
    .slice(0, TOP_TARGETS)
    .map(({ key, kind, label, type, targetId, ms }) => ({ key, kind, label, type, targetId, ms }));
  const otherMs = ranked.slice(TOP_TARGETS).reduce((sum, row) => sum + row.ms, 0);
  if (otherMs > 0) targets.push({ key: 'other', kind: 'other', label: '기타', ms: otherMs });
  if (noneMs > 0) targets.push({ key: 'none', kind: 'none', label: '대상 없음', ms: noneMs });

  return {
    totalMs,
    completedCount: inRange.filter((s) => s.completed).length,
    averagePerDayMs: days === 0 ? 0 : totalMs / days,
    buckets,
    targets,
  };
}

// ---- 할 일 ----

export interface TaskStats {
  doneCount: number;
  byPriority: Record<Priority, number>;
  /** 기간과 상관없이 지금 지난 할 일 수 */
  overdueCount: number;
}

export function taskStats(
  tasks: readonly Task[],
  period: StatsPeriod,
  today: LocalDate,
  dayStartHour: number,
): TaskStats {
  const end = effectiveEnd(period, today);
  const byPriority: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  let doneCount = 0;
  for (const task of tasks) {
    if (task.status !== 'done' || task.completedAt === null) continue;
    const date = todayOf(task.completedAt, dayStartHour);
    if (compareDates(date, period.from) < 0 || compareDates(date, end) > 0) continue;
    doneCount++;
    byPriority[task.priority]++;
  }
  return {
    doneCount,
    byPriority,
    overdueCount: tasks.filter((task) => isOverdue(task, today)).length,
  };
}

// ---- 습관 ----

export interface HabitStatsRow {
  habit: Habit;
  done: number;
  total: number;
  /** 0~1, 분모 0이면 null */
  rate: number | null;
  streak: Streak;
}

export interface HabitStats {
  /** 전체 습관 달성률 = 습관별 (분자 합 / 분모 합) */
  overall: { done: number; total: number; rate: number | null };
  rows: HabitStatsRow[];
}

/** 이 습관이 기간과 겹치는지(시작 전·보관 뒤의 기간이면 표에서 뺀다). */
function overlapsPeriod(habit: Habit, from: LocalDate, end: LocalDate): boolean {
  if (compareDates(habit.startDate, end) > 0) return false;
  return habit.archivedOn === null || compareDates(habit.archivedOn, from) > 0;
}

export function habitStats(
  habits: readonly Habit[],
  logs: readonly HabitLog[],
  period: StatsPeriod,
  today: LocalDate,
  weekStartsOn: 1 | 7,
): HabitStats {
  const end = effectiveEnd(period, today);
  const byHabit = new Map<string, Map<LocalDate, number>>();
  for (const log of logs) {
    const values = byHabit.get(log.habitId) ?? new Map<LocalDate, number>();
    values.set(log.date, log.value);
    byHabit.set(log.habitId, values);
  }

  const rows: HabitStatsRow[] = [];
  if (compareDates(period.from, end) <= 0) {
    for (const habit of habits) {
      if (!overlapsPeriod(habit, period.from, end)) continue;
      const values: LogValues = byHabit.get(habit.id) ?? new Map();
      const { done, total, rate } = achievementRate(
        habit,
        values,
        period.from,
        end,
        today,
        weekStartsOn,
      );
      rows.push({ habit, done, total, rate, streak: streak(habit, values, today, weekStartsOn) });
    }
  }

  const done = rows.reduce((sum, r) => sum + r.done, 0);
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return { overall: { done, total, rate: total === 0 ? null : done / total }, rows };
}
