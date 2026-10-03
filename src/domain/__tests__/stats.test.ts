import { describe, expect, it } from 'vitest';
import { makeLocalDate, parseLocalDate } from '../dates';
import {
  elapsedDays,
  effectiveEnd,
  focusStats,
  formatFocusTime,
  formatPercent,
  formatPeriodLabel,
  habitStats,
  isFuturePeriod,
  periodOf,
  periodRangeMs,
  sessionDate,
  shiftAnchor,
  taskStats,
  TOP_TARGETS,
} from '../stats';
import type { FocusSession, Habit, HabitLog, LocalDate, Task } from '../types';

function d(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (!date) throw new Error(`잘못된 날짜: ${text}`);
  return date;
}
const at = (y: number, m: number, day: number, h = 12, min = 0) =>
  new Date(y, m - 1, day, h, min).getTime();

// 2026-10-03은 토요일. 그 주(월 시작)는 9/28~10/4.
const TODAY = d('2026-10-03');
const MIN = 60_000;

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  const startedAt = overrides.startedAt ?? at(2026, 10, 1, 10);
  return {
    id: `s-${startedAt}-${Math.random()}`,
    target: null,
    targetId: null,
    startedAt,
    endedAt: startedAt + 25 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 25 * MIN,
    completed: true,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `t-${Math.random()}`,
    title: '할 일',
    note: '',
    priority: 'medium',
    dueDate: null,
    projectId: null,
    tagIds: [],
    subtasks: [],
    status: 'todo',
    completedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '물 마시기',
    note: '',
    color: 'blue',
    emoji: null,
    schedule: { type: 'daily' },
    goal: { type: 'check' },
    startDate: d('2026-09-01'),
    archivedOn: null,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function log(habitId: string, date: string, value = 1): HabitLog {
  return { id: `${habitId}:${date}`, habitId, date: d(date), value, updatedAt: 0 };
}

describe('기간', () => {
  it('주는 weekStartsOn 기준 7일, 월·연은 달력 기준', () => {
    expect(periodOf(TODAY, 'week', 1)).toEqual({
      unit: 'week',
      from: d('2026-09-28'),
      to: d('2026-10-04'),
    });
    expect(periodOf(TODAY, 'week', 7)).toEqual({
      unit: 'week',
      from: d('2026-09-27'),
      to: d('2026-10-03'),
    });
    expect(periodOf(TODAY, 'month', 1)).toMatchObject({
      from: d('2026-10-01'),
      to: d('2026-10-31'),
    });
    expect(periodOf(TODAY, 'year', 1)).toMatchObject({
      from: d('2026-01-01'),
      to: d('2026-12-31'),
    });
  });

  it('이전·다음 이동: 월말에서도 한 달씩, 연말·연초를 넘는다', () => {
    expect(shiftAnchor(d('2026-10-31'), 'month', 1)).toBe(d('2026-11-01'));
    expect(shiftAnchor(d('2026-03-31'), 'month', -1)).toBe(d('2026-02-01'));
    expect(shiftAnchor(d('2026-01-15'), 'month', -1)).toBe(d('2025-12-01'));
    expect(shiftAnchor(d('2026-10-03'), 'year', -1)).toBe(d('2025-10-01'));
    expect(shiftAnchor(d('2026-10-03'), 'week', 1)).toBe(d('2026-10-10'));
  });

  it('지나간 날 수와 집계 끝: 이번 주는 오늘까지, 지난 기간은 전체, 미래는 0', () => {
    const thisWeek = periodOf(TODAY, 'week', 1);
    expect(effectiveEnd(thisWeek, TODAY)).toBe(TODAY);
    expect(elapsedDays(thisWeek, TODAY)).toBe(6);

    const lastWeek = periodOf(d('2026-09-25'), 'week', 1);
    expect(elapsedDays(lastWeek, TODAY)).toBe(7);

    const nextWeek = periodOf(d('2026-10-10'), 'week', 1);
    expect(isFuturePeriod(nextWeek, TODAY)).toBe(true);
    expect(elapsedDays(nextWeek, TODAY)).toBe(0);
    expect(isFuturePeriod(thisWeek, TODAY)).toBe(false);
  });

  it('조회용 시각 범위는 dayStartHour를 반영한다', () => {
    const week = periodOf(TODAY, 'week', 1);
    expect(periodRangeMs(week, 0)).toEqual({ start: at(2026, 9, 28, 0), end: at(2026, 10, 5, 0) });
    expect(periodRangeMs(week, 4)).toEqual({ start: at(2026, 9, 28, 4), end: at(2026, 10, 5, 4) });
  });

  it('기간 라벨', () => {
    expect(formatPeriodLabel(periodOf(TODAY, 'week', 1))).toBe(
      '2026년 9월 28일 (월) ~ 10월 4일 (일)',
    );
    // 해가 바뀌는 주는 끝 날짜에도 연도를 붙인다
    expect(formatPeriodLabel(periodOf(d('2025-12-31'), 'week', 1))).toBe(
      '2025년 12월 29일 (월) ~ 2026년 1월 4일 (일)',
    );
    expect(formatPeriodLabel(periodOf(TODAY, 'month', 1))).toBe('2026년 10월');
    expect(formatPeriodLabel(periodOf(TODAY, 'year', 1))).toBe('2026년');
  });
});

describe('표시 형식', () => {
  it('시간: 1시간 25분 / 1분 미만 / 0분', () => {
    expect(formatFocusTime(85 * MIN)).toBe('1시간 25분');
    expect(formatFocusTime(120 * MIN)).toBe('2시간');
    expect(formatFocusTime(45 * MIN)).toBe('45분');
    expect(formatFocusTime(59_999)).toBe('1분 미만');
    expect(formatFocusTime(1)).toBe('1분 미만');
    expect(formatFocusTime(MIN)).toBe('1분');
    expect(formatFocusTime(0)).toBe('0분');
  });

  it('비율: 반올림한 %, null은 기록 없음(0%와 구분)', () => {
    expect(formatPercent(0.666)).toBe('67%');
    expect(formatPercent(0.004)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(null)).toBe('기록 없음');
  });
});

describe('집중 집계', () => {
  const week = periodOf(TODAY, 'week', 1);

  it('빈 기간: 모두 0, 막대는 있고 지나간 날은 0·미래는 null', () => {
    const stats = focusStats([], week, TODAY, 0);
    expect(stats).toMatchObject({ totalMs: 0, completedCount: 0, averagePerDayMs: 0, targets: [] });
    expect(stats.buckets).toHaveLength(7);
    expect(stats.buckets.map((b) => b.ms)).toEqual([0, 0, 0, 0, 0, 0, null]);
  });

  it('합계·완료 수·하루 평균(지나간 날 수로 나눔)', () => {
    const sessions = [
      session({ startedAt: at(2026, 9, 28), actualMs: 30 * MIN }),
      session({ startedAt: at(2026, 10, 1), actualMs: 60 * MIN }),
      session({ startedAt: at(2026, 10, 3), actualMs: 12 * MIN, completed: false }),
    ];
    const stats = focusStats(sessions, week, TODAY, 0);
    expect(stats.totalMs).toBe(102 * MIN);
    expect(stats.completedCount).toBe(2);
    expect(stats.averagePerDayMs).toBe((102 * MIN) / 6); // 월~토 6일
    expect(stats.buckets.map((b) => b.ms)).toEqual(
      [30, 0, 0, 60, 0, 12, null].map((v) => (v === null ? null : v * MIN)),
    );
  });

  it('미래 날짜의 세션은 집계하지 않는다', () => {
    const stats = focusStats([session({ startedAt: at(2026, 10, 4, 9) })], week, TODAY, 0);
    expect(stats.totalMs).toBe(0);
  });

  it('다음 주로 이동하면 전부 비어 있다(0이 아니라 null)', () => {
    const next = periodOf(d('2026-10-10'), 'week', 1);
    const stats = focusStats([session({ startedAt: at(2026, 10, 7) })], next, TODAY, 0);
    expect(stats.totalMs).toBe(0);
    expect(stats.averagePerDayMs).toBe(0);
    expect(stats.buckets.every((b) => b.ms === null)).toBe(true);
  });

  it('월 단위는 일별 막대(31개), 연 단위는 12개 월 막대', () => {
    expect(focusStats([], periodOf(TODAY, 'month', 1), TODAY, 0).buckets).toHaveLength(31);
    const year = focusStats(
      [
        session({ startedAt: at(2026, 1, 15), actualMs: 10 * MIN }),
        session({ startedAt: at(2026, 1, 31, 23), actualMs: 5 * MIN }),
        session({ startedAt: at(2026, 10, 2), actualMs: 20 * MIN }),
      ],
      periodOf(TODAY, 'year', 1),
      TODAY,
      0,
    );
    expect(year.buckets).toHaveLength(12);
    expect(year.buckets[0]).toMatchObject({
      key: makeLocalDate(2026, 1, 1),
      label: '1월',
      ms: 15 * MIN,
    });
    expect(year.buckets[1]?.ms).toBe(0);
    expect(year.buckets[9]?.ms).toBe(20 * MIN); // 10월
    expect(year.buckets[10]?.ms).toBeNull(); // 11월은 아직
    expect(year.buckets[11]?.ms).toBeNull();
  });

  it('자정을 넘긴 세션은 시작한 날에 귀속된다', () => {
    const s = session({ startedAt: at(2026, 10, 1, 23, 50), actualMs: 25 * MIN });
    expect(sessionDate(s, 0)).toBe(d('2026-10-01'));
    const stats = focusStats([s], week, TODAY, 0);
    expect(stats.buckets[3]?.ms).toBe(25 * MIN); // 목(10/1)
    expect(stats.buckets[4]?.ms).toBe(0); // 금(10/2)
  });

  it('dayStartHour=4면 새벽 3시 세션은 전날로 귀속된다', () => {
    const s = session({ startedAt: at(2026, 10, 2, 3, 0) });
    expect(sessionDate(s, 4)).toBe(d('2026-10-01'));
    expect(sessionDate(s, 0)).toBe(d('2026-10-02'));
  });

  it('대상별: 상위 5 + 기타 + 대상 없음, 이름은 가장 최근 세션 기준', () => {
    const sessions: FocusSession[] = [];
    // 대상 7개: 시간이 7개 > 6 > ... > 1 (분 단위 x10)
    for (let i = 1; i <= 7; i++) {
      sessions.push(
        session({
          startedAt: at(2026, 10, 1, 8 + i),
          actualMs: i * 10 * MIN,
          target: { type: 'task', id: `t${i}`, titleSnapshot: `일 ${i}` },
          targetId: `t${i}`,
        }),
      );
    }
    sessions.push(session({ startedAt: at(2026, 10, 2, 9), actualMs: 7 * MIN }));
    // 같은 대상의 이름이 바뀐 경우
    sessions.push(
      session({
        startedAt: at(2026, 10, 2, 15),
        actualMs: 10 * MIN,
        target: { type: 'task', id: 't7', titleSnapshot: '일 7 (새 이름)' },
        targetId: 't7',
      }),
    );

    const { targets } = focusStats(sessions, week, TODAY, 0);
    expect(targets).toHaveLength(TOP_TARGETS + 2);
    expect(targets.slice(0, 5).map((r) => r.ms / MIN)).toEqual([80, 60, 50, 40, 30]);
    expect(targets[0]?.label).toBe('일 7 (새 이름)');
    expect(targets[5]).toMatchObject({ kind: 'other', label: '기타', ms: 30 * MIN }); // 20 + 10
    expect(targets[6]).toMatchObject({ kind: 'none', label: '대상 없음', ms: 7 * MIN });
  });

  it('대상이 5개 이하면 기타는 없고, 대상 없음만 있으면 그것만 나온다', () => {
    const only = focusStats([session({ actualMs: 10 * MIN })], week, TODAY, 0);
    expect(only.targets.map((r) => r.kind)).toEqual(['none']);
  });
});

describe('할 일 집계', () => {
  const week = periodOf(TODAY, 'week', 1);

  it('기간 내 완료 수를 completedAt 기준으로 세고 우선순위별로 나눈다', () => {
    const tasks = [
      task({ status: 'done', completedAt: at(2026, 9, 28), priority: 'high' }),
      task({ status: 'done', completedAt: at(2026, 10, 2), priority: 'low' }),
      task({ status: 'done', completedAt: at(2026, 10, 3), priority: 'low' }),
      task({ status: 'done', completedAt: at(2026, 9, 27, 23), priority: 'high' }), // 지난주
      task({ status: 'todo' }),
    ];
    const stats = taskStats(tasks, week, TODAY, 0);
    expect(stats.doneCount).toBe(3);
    expect(stats.byPriority).toEqual({ high: 1, medium: 0, low: 2 });
  });

  it('지난 할 일 수는 기간과 무관하게 현재 기준', () => {
    const tasks = [
      task({ dueDate: d('2026-10-02') }),
      task({ dueDate: d('2026-10-03') }), // 오늘 마감은 아직 지나지 않음
      task({ dueDate: d('2026-09-01'), status: 'done', completedAt: at(2026, 9, 2) }),
    ];
    expect(taskStats(tasks, periodOf(d('2026-01-10'), 'month', 1), TODAY, 0).overdueCount).toBe(1);
  });

  it('미래 기간은 비어 있다', () => {
    const next = periodOf(d('2026-10-10'), 'week', 1);
    const stats = taskStats(
      [task({ status: 'done', completedAt: at(2026, 10, 8) })],
      next,
      TODAY,
      0,
    );
    expect(stats.doneCount).toBe(0);
  });
});

describe('습관 집계', () => {
  const week = periodOf(TODAY, 'week', 1);

  it('습관별 달성률은 같은 기간·같은 규칙으로 계산된다(오늘 미달성은 분모 제외)', () => {
    const logs = [log('h1', '2026-09-28'), log('h1', '2026-09-29'), log('h1', '2026-10-01')];
    const stats = habitStats([habit()], logs, week, TODAY, 1);
    // 9/28~10/2 예정 5일 중 3일 달성, 오늘(10/3) 미달성은 분모 제외
    expect(stats.rows[0]).toMatchObject({ done: 3, total: 5 });
    expect(stats.rows[0]?.rate).toBeCloseTo(0.6);
    expect(stats.overall).toMatchObject({ done: 3, total: 5 });
  });

  it('전체 달성률은 습관별 분자 합 / 분모 합', () => {
    const habits = [
      habit(),
      habit({ id: 'h2', name: '운동', schedule: { type: 'weekdays', days: [1, 3, 5] } }),
    ];
    const logs = [log('h1', '2026-09-28'), log('h2', '2026-09-28'), log('h2', '2026-09-30')];
    const stats = habitStats(habits, logs, week, TODAY, 1);
    const h2 = stats.rows[1];
    expect(h2).toMatchObject({ done: 2, total: 3 }); // 월·수·금 중 금요일 미달성
    expect(stats.overall.total).toBe((stats.rows[0]?.total ?? 0) + 3);
    expect(stats.overall.done).toBe((stats.rows[0]?.done ?? 0) + 2);
  });

  it('연속 기록을 함께 돌려준다', () => {
    const logs = [log('h1', '2026-10-01'), log('h1', '2026-10-02')];
    const row = habitStats([habit()], logs, week, TODAY, 1).rows[0];
    expect(row?.streak).toMatchObject({ unit: 'day', current: 2 });
  });

  it('분모가 0이면 null(기록 없음)', () => {
    const stats = habitStats([habit({ startDate: d('2026-10-03') })], [], week, TODAY, 1);
    expect(stats.rows[0]).toMatchObject({ total: 0, rate: null }); // 오늘 미달성만 있어 분모 0
    expect(stats.overall.rate).toBeNull();
  });

  it('기간과 겹치지 않는 습관(시작 전·보관 뒤)은 표에서 뺀다', () => {
    const habits = [
      habit({ id: 'later', startDate: d('2026-10-20') }),
      habit({ id: 'old', archivedOn: d('2026-09-10') }),
      habit({ id: 'archivedInside', archivedOn: d('2026-10-01') }),
    ];
    const rows = habitStats(habits, [], week, TODAY, 1).rows;
    expect(rows.map((r) => r.habit.id)).toEqual(['archivedInside']);
  });

  it('미래 기간은 비어 있다', () => {
    const next = periodOf(d('2026-10-10'), 'week', 1);
    const stats = habitStats([habit()], [log('h1', '2026-10-09')], next, TODAY, 1);
    expect(stats.rows).toEqual([]);
    expect(stats.overall.rate).toBeNull();
  });
});
