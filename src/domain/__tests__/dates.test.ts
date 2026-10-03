import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  compareDates,
  dayRangeMs,
  diffDays,
  eachDay,
  formatDateLong,
  isoWeekday,
  makeLocalDate,
  monthRange,
  nextDayBoundary,
  parseLocalDate,
  todayOf,
  toDate,
  weekRange,
  yearRange,
} from '../dates';
import type { LocalDate } from '../types';

const d = (s: string) => {
  const parsed = parseLocalDate(s);
  if (!parsed) throw new Error(`테스트 날짜 오류: ${s}`);
  return parsed;
};
const at = (y: number, m: number, day: number, h = 0, min = 0) =>
  new Date(y, m - 1, day, h, min).getTime();

describe('parseLocalDate / makeLocalDate', () => {
  it('올바른 날짜를 받아들인다', () => {
    expect(parseLocalDate('2026-10-03')).toBe('2026-10-03');
    expect(parseLocalDate('2024-02-29')).toBe('2024-02-29');
  });

  it('존재하지 않는 날짜와 잘못된 형식을 거절한다', () => {
    expect(parseLocalDate('2026-02-29')).toBeNull();
    expect(parseLocalDate('2026-13-01')).toBeNull();
    expect(parseLocalDate('2026-1-1')).toBeNull();
    expect(parseLocalDate('abcd')).toBeNull();
  });

  it('범위를 넘긴 월·일을 이월한다', () => {
    expect(makeLocalDate(2026, 13, 1)).toBe('2027-01-01');
    expect(makeLocalDate(2026, 3, 0)).toBe('2026-02-28');
  });

  it('toDate는 로컬 자정을 돌려준다', () => {
    const date = toDate(d('2026-10-03'));
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 9, 3, 0,
    ]);
  });
});

describe('todayOf (dayStartHour)', () => {
  it('dayStartHour=0이면 로컬 날짜 그대로', () => {
    expect(todayOf(at(2026, 10, 3, 0, 0), 0)).toBe('2026-10-03');
    expect(todayOf(at(2026, 10, 3, 23, 59), 0)).toBe('2026-10-03');
  });

  it('dayStartHour=4에서 새벽 3시는 어제, 4시는 오늘 (§4.3 사례 10)', () => {
    expect(todayOf(at(2026, 10, 3, 3, 0), 4)).toBe('2026-10-02');
    expect(todayOf(at(2026, 10, 3, 3, 59), 4)).toBe('2026-10-02');
    expect(todayOf(at(2026, 10, 3, 4, 0), 4)).toBe('2026-10-03');
  });

  it('월초·연초 새벽도 이전 날짜로 넘어간다', () => {
    expect(todayOf(at(2026, 3, 1, 2, 0), 4)).toBe('2026-02-28');
    expect(todayOf(at(2026, 1, 1, 1, 0), 4)).toBe('2025-12-31');
    expect(todayOf(at(2024, 3, 1, 1, 0), 4)).toBe('2024-02-29');
  });
});

describe('dayRangeMs / nextDayBoundary', () => {
  it('하루 범위는 [날짜 dayStartHour:00, 다음 날 dayStartHour:00)', () => {
    const r = dayRangeMs(d('2026-10-03'), 4);
    expect(r.start).toBe(at(2026, 10, 3, 4));
    expect(r.end).toBe(at(2026, 10, 4, 4));
  });

  it('다음 경계 시각을 계산한다', () => {
    expect(nextDayBoundary(at(2026, 10, 3, 3, 0), 4)).toBe(at(2026, 10, 3, 4));
    expect(nextDayBoundary(at(2026, 10, 3, 10, 0), 4)).toBe(at(2026, 10, 4, 4));
    expect(nextDayBoundary(at(2026, 12, 31, 12, 0), 0)).toBe(at(2027, 1, 1, 0));
  });
});

describe('addDays / addMonths / diffDays / compareDates', () => {
  it('월말·연말 경계를 넘는다', () => {
    expect(addDays(d('2026-01-31'), 1)).toBe('2026-02-01');
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2027-01-01'), -1)).toBe('2026-12-31');
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
  });

  it('윤년을 처리한다', () => {
    expect(addDays(d('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(d('2024-02-29'), 1)).toBe('2024-03-01');
    expect(addDays(d('2025-02-28'), 1)).toBe('2025-03-01');
    expect(diffDays(d('2024-01-01'), d('2025-01-01'))).toBe(366);
    expect(diffDays(d('2025-01-01'), d('2026-01-01'))).toBe(365);
  });

  it('addMonths는 말일로 맞춘다', () => {
    expect(addMonths(d('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(d('2024-01-31'), 1)).toBe('2024-02-29');
    expect(addMonths(d('2026-12-15'), 1)).toBe('2027-01-15');
    expect(addMonths(d('2026-01-15'), -1)).toBe('2025-12-15');
  });

  it('diffDays와 compareDates', () => {
    expect(diffDays(d('2026-10-03'), d('2026-10-10'))).toBe(7);
    expect(diffDays(d('2026-10-10'), d('2026-10-03'))).toBe(-7);
    expect(compareDates(d('2026-10-03'), d('2026-10-04'))).toBeLessThan(0);
    expect(compareDates(d('2026-10-03'), d('2026-10-03'))).toBe(0);
    expect(compareDates(d('2027-01-01'), d('2026-12-31'))).toBeGreaterThan(0);
  });
});

describe('isoWeekday', () => {
  it('월=1 … 일=7', () => {
    expect(isoWeekday(d('2026-10-05'))).toBe(1); // 월
    expect(isoWeekday(d('2026-10-03'))).toBe(6); // 토
    expect(isoWeekday(d('2026-10-04'))).toBe(7); // 일
  });
});

describe('weekRange (§4.3 사례 12)', () => {
  it('월요일 시작: 수요일이 속한 주는 월~일', () => {
    expect(weekRange(d('2026-10-07'), 1)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('월요일 시작: 일요일은 지난 월요일이 속한 주의 마지막 날', () => {
    expect(weekRange(d('2026-10-04'), 1)).toEqual({ from: '2026-09-28', to: '2026-10-04' });
  });

  it('일요일 시작: 일요일은 새 주의 첫날', () => {
    expect(weekRange(d('2026-10-04'), 7)).toEqual({ from: '2026-10-04', to: '2026-10-10' });
  });

  it('일요일 시작: 토요일은 주의 마지막 날', () => {
    expect(weekRange(d('2026-10-10'), 7)).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(weekRange(d('2026-10-03'), 7)).toEqual({ from: '2026-09-27', to: '2026-10-03' });
  });

  it('연말·연초를 가로지르는 주', () => {
    expect(weekRange(d('2026-01-01'), 1)).toEqual({ from: '2025-12-29', to: '2026-01-04' });
  });
});

describe('monthRange / yearRange', () => {
  it('월 범위는 말일을 포함한다', () => {
    expect(monthRange(d('2026-10-15'))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthRange(d('2026-02-10'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(d('2024-02-10'))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange(d('2026-12-31'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('연 범위', () => {
    expect(yearRange(d('2026-06-15'))).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('eachDay / formatDateLong', () => {
  it('양끝을 포함해 나열한다', () => {
    const days: LocalDate[] = eachDay(d('2026-02-27'), d('2026-03-02'));
    expect(days).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(eachDay(d('2026-03-02'), d('2026-03-01'))).toEqual([]);
  });

  it('날짜 표시 형식', () => {
    expect(formatDateLong(d('2026-10-03'))).toBe('10월 3일 토요일');
  });
});
