import { describe, expect, it } from 'vitest';
import {
  achievementRate,
  dayStatus,
  goalValue,
  habitsForToday,
  heatmapWeeks,
  weeklyProgress,
  isAchievedValue,
  isScheduled,
  loggability,
  streak,
  toLogValues,
} from '../habits';
import { parseLocalDate, todayOf } from '../dates';
import type { Habit, HabitSchedule, LocalDate } from '../types';

// 2026-10-03은 토요일. 주(월~일): 9/28 ~ 10/4
function d(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (!date) throw new Error(`잘못된 날짜: ${text}`);
  return date;
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '습관',
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

/** 날짜 목록을 값 1(또는 지정한 값)로 기록한 로그 맵으로 만든다. */
function logsOf(dates: string[], value = 1) {
  return toLogValues(
    dates.map((date) => ({
      id: `h1:${date}`,
      habitId: 'h1',
      date: d(date),
      value,
      updatedAt: 0,
    })),
  );
}

const TODAY = d('2026-10-03');

describe('연속 기록 — 일 단위 (§4.3 필수 사례)', () => {
  it('1. daily: 오늘 미달성 + 어제까지 3일 연속 → 현재 3', () => {
    const logs = logsOf(['2026-09-30', '2026-10-01', '2026-10-02']);
    expect(streak(makeHabit(), logs, TODAY, 1)).toMatchObject({ unit: 'day', current: 3, best: 3 });
  });

  it('2. daily: 오늘 달성 + 어제 미달성 → 현재 1', () => {
    const logs = logsOf(['2026-09-30', '2026-10-03']);
    const result = streak(makeHabit(), logs, TODAY, 1);
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
  });

  it('3. weekdays(월·수·금): 화·목 미기록은 연속을 끊지 않는다', () => {
    const habit = makeHabit({
      schedule: { type: 'weekdays', days: [1, 3, 5] },
      startDate: d('2026-09-28'),
    });
    const logs = logsOf(['2026-09-28', '2026-09-30', '2026-10-02']); // 월·수·금
    expect(streak(habit, logs, d('2026-10-02'), 1)).toMatchObject({ current: 3, best: 3 });
  });

  it('4. weekdays: 오늘이 비예정 요일이면 직전 예정일부터 계산한다', () => {
    const habit = makeHabit({
      schedule: { type: 'weekdays', days: [1, 3, 5] },
      startDate: d('2026-09-28'),
    });
    // 오늘(토)은 비예정. 금·수 달성, 월 미달성 → 2
    const logs = logsOf(['2026-09-30', '2026-10-02']);
    expect(streak(habit, logs, TODAY, 1).current).toBe(2);
  });

  it('5. startDate 이전 기록은 무시한다', () => {
    const habit = makeHabit({ startDate: d('2026-10-01') });
    const logs = logsOf(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(streak(habit, logs, TODAY, 1)).toMatchObject({ current: 2, best: 2 });
  });

  it('최고 연속은 현재 연속보다 길 수 있다', () => {
    const logs = logsOf(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-10-02']);
    expect(streak(makeHabit(), logs, TODAY, 1)).toMatchObject({ current: 1, best: 4 });
  });

  it('미달성 예정일을 만나면 현재 연속이 멈춘다', () => {
    const logs = logsOf(['2026-09-28', '2026-10-01', '2026-10-02']); // 9/29, 9/30 비어 있음
    expect(streak(makeHabit(), logs, TODAY, 1).current).toBe(2);
  });

  it('11. archivedOn 이후 날짜는 예정이 아니다', () => {
    const habit = makeHabit({ archivedOn: d('2026-10-01') });
    expect(isScheduled(habit, d('2026-09-30'))).toBe(true);
    expect(isScheduled(habit, d('2026-10-01'))).toBe(false);
    expect(isScheduled(habit, d('2026-10-02'))).toBe(false);
  });

  it('보관한 습관의 연속은 보관 전날까지로 계산한다', () => {
    const habit = makeHabit({ archivedOn: d('2026-10-01') });
    const logs = logsOf(['2026-09-29', '2026-09-30']);
    expect(streak(habit, logs, TODAY, 1)).toMatchObject({ current: 2, best: 2 });
  });
});

describe('연속 기록 — 주 단위 (weeklyCount)', () => {
  const weekly3: HabitSchedule = { type: 'weeklyCount', count: 3 };

  it('6. 이번 주 1회(미달성) + 지난 2주 달성 → 현재 2주', () => {
    const habit = makeHabit({ schedule: weekly3, startDate: d('2026-09-14') });
    const logs = logsOf([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16', // 9/14 주
      '2026-09-21',
      '2026-09-22',
      '2026-09-23', // 9/21 주
      '2026-09-28', // 이번 주 1회
    ]);
    expect(streak(habit, logs, TODAY, 1)).toMatchObject({ unit: 'week', current: 2, best: 2 });
  });

  it('이번 주를 달성하면 이번 주부터 센다', () => {
    const habit = makeHabit({ schedule: weekly3, startDate: d('2026-09-21') });
    const logs = logsOf([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-28',
      '2026-09-29',
      '2026-10-01',
    ]);
    expect(streak(habit, logs, TODAY, 1).current).toBe(2);
  });

  it('지난주가 미달성이면 연속이 끊긴다', () => {
    const habit = makeHabit({ schedule: weekly3, startDate: d('2026-09-14') });
    const logs = logsOf(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-21', '2026-09-22']);
    expect(streak(habit, logs, TODAY, 1)).toMatchObject({ current: 0, best: 1 });
  });

  it('7. 시작 주의 요구 횟수 = min(count, 시작일부터 주 끝까지 일수)', () => {
    const today = d('2026-10-05'); // 월요일: 9/28 주는 이미 끝났다
    // 수요일(9/30) 시작 → 남은 5일 → 요구 3회. 2회만 하면 미달성
    const wed = makeHabit({ schedule: weekly3, startDate: d('2026-09-30') });
    expect(
      achievementRate(wed, logsOf(['2026-09-30', '2026-10-01']), d('2026-09-28'), today, today, 1),
    ).toMatchObject({ done: 2, total: 3 });
    // 토요일(10/3) 시작 → 남은 2일 → 요구 2회. 2회 하면 달성
    const sat = makeHabit({ schedule: weekly3, startDate: d('2026-10-03') });
    expect(
      achievementRate(sat, logsOf(['2026-10-03', '2026-10-04']), d('2026-09-28'), today, today, 1),
    ).toMatchObject({ done: 2, total: 2 });
  });

  it('토요일에 시작하고 이틀 모두 하면 그 주는 달성으로 이어진다', () => {
    const habit = makeHabit({ schedule: weekly3, startDate: d('2026-10-03') });
    const logs = logsOf(['2026-10-03', '2026-10-04']);
    expect(streak(habit, logs, d('2026-10-04'), 1)).toMatchObject({ current: 1, best: 1 });
  });

  it('보관한 주의 요구 횟수 = min(count, 주 시작부터 보관 전날까지 일수)', () => {
    // 수요일(9/30)에 보관 → 월·화 2일 → 요구 2회
    const habit = makeHabit({
      schedule: weekly3,
      startDate: d('2026-09-28'),
      archivedOn: d('2026-09-30'),
    });
    const logs = logsOf(['2026-09-28', '2026-09-29']);
    const today = d('2026-10-10');
    expect(achievementRate(habit, logs, d('2026-09-28'), d('2026-10-04'), today, 1)).toMatchObject({
      done: 2,
      total: 2,
    });
    // 보관 뒤의 주는 건너뛰므로 보관한 주가 현재 연속으로 남는다
    expect(streak(habit, logs, today, 1)).toMatchObject({ current: 1, best: 1 });
  });

  it('12. weekStartsOn=7(일요일)이면 주 경계가 일요일이다', () => {
    const habit = makeHabit({ schedule: weekly3, startDate: d('2026-09-20') });
    // 일(9/27)·월·화 → 일요일 시작 기준으론 한 주(9/27~10/3)에 3회
    const logs = logsOf(['2026-09-27', '2026-09-28', '2026-09-29']);
    expect(streak(habit, logs, TODAY, 7).current).toBe(1);
    // 월요일 시작 기준으론 9/27이 지난주라서 이번 주 2회, 지난주 1회 → 연속 없음
    expect(streak(habit, logs, TODAY, 1).current).toBe(0);
  });
});

describe('달성 판정', () => {
  it('8. count형: target 8, value 7 → 미달성', () => {
    const goal = { type: 'count', target: 8, unit: '잔' } as const;
    expect(goalValue(goal)).toBe(8);
    expect(isAchievedValue(goal, 7)).toBe(false);
    expect(isAchievedValue(goal, 8)).toBe(true);
    expect(isAchievedValue(goal, 12)).toBe(true);
  });

  it('count → check로 목표를 바꾸면 value ≥ 1인 날은 달성으로 본다', () => {
    const asCount = makeHabit({ goal: { type: 'count', target: 8, unit: '잔' } });
    const asCheck = makeHabit({ goal: { type: 'check' } });
    const logs = logsOf(['2026-10-01', '2026-10-02'], 3);
    expect(streak(asCount, logs, TODAY, 1).current).toBe(0);
    expect(streak(asCheck, logs, TODAY, 1).current).toBe(2);
  });
});

describe('달성률', () => {
  it('9. 오늘 미달성은 분모에서 빼고, 분모가 0이면 null', () => {
    const habit = makeHabit({ startDate: d('2026-10-01') });
    const logs = logsOf(['2026-10-01']);
    // 10/1 달성, 10/2 미달성, 오늘(10/3) 미달성은 제외 → 1/2
    expect(achievementRate(habit, logs, d('2026-10-01'), TODAY, TODAY, 1)).toEqual({
      done: 1,
      total: 2,
      rate: 0.5,
    });
    // 오늘 달성하면 분모에 들어간다
    expect(
      achievementRate(
        habit,
        logsOf(['2026-10-01', '2026-10-03']),
        d('2026-10-01'),
        TODAY,
        TODAY,
        1,
      ),
    ).toMatchObject({ done: 2, total: 3 });

    // 오늘만 있는 범위에서 오늘이 미달성 → 분모 0
    const onlyToday = makeHabit({ startDate: TODAY });
    expect(achievementRate(onlyToday, logsOf([]), TODAY, TODAY, TODAY, 1)).toEqual({
      done: 0,
      total: 0,
      rate: null,
    });
  });

  it('시작일 이전과 보관 이후는 분모에 넣지 않는다', () => {
    const habit = makeHabit({ startDate: d('2026-10-01'), archivedOn: d('2026-10-03') });
    expect(
      achievementRate(habit, logsOf(['2026-10-01']), d('2026-09-01'), TODAY, TODAY, 1),
    ).toMatchObject({
      done: 1,
      total: 2,
    });
  });

  it('weekdays는 예정일만 센다', () => {
    const habit = makeHabit({
      schedule: { type: 'weekdays', days: [1, 3, 5] },
      startDate: d('2026-09-28'),
    });
    const logs = logsOf(['2026-09-28', '2026-10-02']);
    // 월·수·금 3일 중 2일 달성 (오늘 토는 비예정)
    expect(achievementRate(habit, logs, d('2026-09-28'), TODAY, TODAY, 1)).toMatchObject({
      done: 2,
      total: 3,
    });
  });

  it('weeklyCount: 이번 주는 달성했을 때만 포함한다', () => {
    const habit = makeHabit({
      schedule: { type: 'weeklyCount', count: 3 },
      startDate: d('2026-09-21'),
    });
    const lastWeek = ['2026-09-21', '2026-09-22'];
    const range = [d('2026-09-21'), TODAY] as const;

    // 이번 주 1회(미달성) → 이번 주 제외. 지난주 2/3
    expect(
      achievementRate(habit, logsOf([...lastWeek, '2026-09-28']), ...range, TODAY, 1),
    ).toMatchObject({ done: 2, total: 3 });

    // 이번 주 3회(달성) → 이번 주 포함. 2/3 + 3/3
    expect(
      achievementRate(
        habit,
        logsOf([...lastWeek, '2026-09-28', '2026-09-29', '2026-09-30']),
        ...range,
        TODAY,
        1,
      ),
    ).toMatchObject({ done: 5, total: 6 });
  });

  it('weeklyCount: 요구 횟수보다 많이 해도 분자는 요구 횟수까지만 센다', () => {
    const habit = makeHabit({
      schedule: { type: 'weeklyCount', count: 2 },
      startDate: d('2026-09-21'),
    });
    const logs = logsOf(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    const today = d('2026-10-05');
    expect(achievementRate(habit, logs, d('2026-09-21'), d('2026-09-27'), today, 1)).toMatchObject({
      done: 2,
      total: 2,
    });
  });
});

describe('기록 가능 범위', () => {
  const habit = makeHabit();

  it('오늘과 7일 전은 가능, 8일 전과 미래는 불가', () => {
    expect(loggability(habit, d('2026-10-03'), TODAY).ok).toBe(true);
    expect(loggability(habit, d('2026-09-26'), TODAY).ok).toBe(true); // 7일 전
    const eightAgo = loggability(habit, d('2026-09-25'), TODAY);
    expect(eightAgo.ok).toBe(false);
    if (!eightAgo.ok) expect(eightAgo.reason).toContain('7일');
    expect(loggability(habit, d('2026-10-04'), TODAY).ok).toBe(false);
  });

  it('weekdays 습관의 비예정 요일은 불가', () => {
    const mwf = makeHabit({ schedule: { type: 'weekdays', days: [1, 3, 5] } });
    expect(loggability(mwf, d('2026-09-29'), TODAY).ok).toBe(false); // 화
    expect(loggability(mwf, d('2026-09-30'), TODAY).ok).toBe(true); // 수
  });

  it('weeklyCount는 매일 기록할 수 있다', () => {
    const weekly = makeHabit({ schedule: { type: 'weeklyCount', count: 3 } });
    expect(loggability(weekly, d('2026-09-29'), TODAY).ok).toBe(true);
  });

  it('시작일 전과 보관일 이후는 불가', () => {
    expect(loggability(makeHabit({ startDate: d('2026-10-02') }), d('2026-10-01'), TODAY).ok).toBe(
      false,
    );
    expect(loggability(makeHabit({ archivedOn: d('2026-10-02') }), d('2026-10-02'), TODAY).ok).toBe(
      false,
    );
  });
});

describe('하루 기준', () => {
  it('10. dayStartHour=4에서 새벽 3시 기록은 어제 날짜로 들어간다', () => {
    const threeAm = new Date(2026, 9, 3, 3, 0).getTime();
    const today = todayOf(threeAm, 4);
    expect(today).toBe('2026-10-02');
    // 그 "오늘"에 기록하면 어제(달력상) 날짜의 달성으로 연속에 반영된다
    const logs = logsOf(['2026-10-02']);
    expect(streak(makeHabit(), logs, today, 1).current).toBe(1);
  });
});

describe('오늘 화면·히트맵', () => {
  const today = d('2026-10-03'); // 토요일

  it('habitsForToday: 오늘 예정인 활성 습관만. weeklyCount는 매일 포함', () => {
    const habits = [
      makeHabit({ id: 'daily' }),
      makeHabit({ id: 'monWed', schedule: { type: 'weekdays', days: [1, 3] } }),
      makeHabit({ id: 'sat', schedule: { type: 'weekdays', days: [6] } }),
      makeHabit({ id: 'weekly', schedule: { type: 'weeklyCount', count: 3 } }),
      makeHabit({ id: 'archived', archivedOn: d('2026-10-01') }),
      makeHabit({ id: 'future', startDate: d('2026-10-04') }),
    ];
    expect(habitsForToday(habits, today).map((h) => h.id)).toEqual(['daily', 'sat', 'weekly']);
  });

  it('weeklyProgress: 이번 주 달성일/요구 횟수, 다른 일정이면 null', () => {
    const weekly = makeHabit({ schedule: { type: 'weeklyCount', count: 3 } });
    const logs = logsOf(['2026-09-28', '2026-10-02']);
    expect(weeklyProgress(weekly, logs, today, 1)).toEqual({ done: 2, required: 3 });
    expect(weeklyProgress(makeHabit(), logs, today, 1)).toBeNull();
  });

  it('dayStatus: 상태별로 구분한다', () => {
    const habit = makeHabit({
      schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
      startDate: d('2026-09-10'),
      archivedOn: null,
    });
    const logs = logsOf(['2026-10-01']);
    expect(dayStatus(habit, logs, d('2026-10-01'), today).kind).toBe('done');
    expect(dayStatus(habit, logs, d('2026-10-02'), today).kind).toBe('missed'); // 금요일 미기록
    expect(dayStatus(habit, logs, d('2026-10-03'), today).kind).toBe('off'); // 토요일
    expect(dayStatus(habit, logs, d('2026-09-09'), today).kind).toBe('untracked'); // 시작 전
    expect(dayStatus(habit, logs, d('2026-10-04'), today).kind).toBe('future');
  });

  it('dayStatus: 주 N회 습관은 못 채운 날을 미달성이 아니라 빈 칸으로 둔다', () => {
    const habit = makeHabit({
      schedule: { type: 'weeklyCount', count: 3 },
      startDate: d('2026-09-10'),
      archivedOn: null,
    });
    const logs = logsOf(['2026-10-01']);
    expect(dayStatus(habit, logs, d('2026-10-01'), today).kind).toBe('done');
    expect(dayStatus(habit, logs, d('2026-10-02'), today).kind).toBe('blank');
    expect(dayStatus(habit, logs, d('2026-09-09'), today).kind).toBe('untracked');
    expect(dayStatus(habit, logs, d('2026-10-04'), today).kind).toBe('future');
  });

  it('dayStatus: 횟수형 일부 달성은 1~33 / 34~66 / 67~99% 단계로 나눈다', () => {
    const habit = makeHabit({ goal: { type: 'count', target: 8, unit: '잔' } });
    const level = (value: number) => {
      const status = dayStatus(habit, new Map([[d('2026-10-02'), value]]), d('2026-10-02'), today);
      return [status.kind, status.level];
    };
    expect(level(1)).toEqual(['partial', 1]); // 12%
    expect(level(2)).toEqual(['partial', 1]); // 25%
    expect(level(3)).toEqual(['partial', 2]); // 37%
    expect(level(5)).toEqual(['partial', 2]); // 62%
    expect(level(6)).toEqual(['partial', 3]); // 75%
    expect(level(7)).toEqual(['partial', 3]); // 87%
    expect(level(8)).toEqual(['done', undefined]);
  });

  it('dayStatus: 보관 후 날짜는 기록 대상 아님', () => {
    const habit = makeHabit({ archivedOn: d('2026-10-01') });
    expect(dayStatus(habit, logsOf([]), d('2026-10-01'), today).kind).toBe('untracked');
    expect(dayStatus(habit, logsOf([]), d('2026-09-30'), today).kind).toBe('missed');
  });

  it('heatmapWeeks: 53주, 마지막 열이 오늘이 든 주, 첫 요일은 weekStartsOn', () => {
    const mon = heatmapWeeks(today, 1);
    expect(mon).toHaveLength(53);
    expect(mon.every((week) => week.length === 7)).toBe(true);
    expect(mon[52]?.[0]).toBe(d('2026-09-28'));
    expect(mon[52]?.[6]).toBe(d('2026-10-04'));
    expect(mon[0]?.[0]).toBe(d('2025-09-29'));

    const sun = heatmapWeeks(today, 7);
    expect(sun[52]?.[0]).toBe(d('2026-09-27'));
    expect(sun[52]?.[6]).toBe(d('2026-10-03'));
  });
});
