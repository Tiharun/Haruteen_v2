// DESIGN.md §4.1. LocalDate는 이 파일의 함수로만 만들고 비교한다.
import type { EpochMs, IsoWeekday, LocalDate } from './types';

const HOUR_MS = 3_600_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Date의 로컬 연·월·일을 LocalDate로 바꾼다. */
export function fromDate(d: Date): LocalDate {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}` as LocalDate;
}

/** 로컬 달력 날짜로 LocalDate를 만든다. month는 1~12. 범위를 벗어난 값은 넘겨서 계산한다. */
export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  const d = new Date(2000, 0, 1);
  d.setFullYear(year, month - 1, day); // 0~99년이 1900년대로 해석되는 것을 막는다
  return fromDate(d);
}

/** 'YYYY-MM-DD' 문자열이 실제 존재하는 날짜면 LocalDate로, 아니면 null. */
export function parseLocalDate(text: string): LocalDate | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const result = makeLocalDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return result === text ? result : null;
}

/** LocalDate를 로컬 시각 Date로 바꾼다(`new Date('YYYY-MM-DD')`는 UTC로 해석되므로 쓰지 않는다). */
export function toDate(date: LocalDate, hour = 0): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`잘못된 LocalDate: ${date}`);
  const d = new Date(2000, 0, 1, hour);
  d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d;
}

/** 오늘(LocalDate) = (now - dayStartHour시간)의 로컬 날짜. */
export function todayOf(now: EpochMs, dayStartHour: number): LocalDate {
  return fromDate(new Date(now - dayStartHour * HOUR_MS));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toDate(date);
  d.setDate(d.getDate() + days);
  return fromDate(d);
}

/** 월을 더한다. 대상 달에 그 일자가 없으면 그 달의 마지막 날로 맞춘다. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const d = toDate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return fromDate(d);
}

/** 사전순 비교가 날짜순과 같다. a<b이면 음수. */
export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** b - a (일). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  const da = toDate(a);
  const db = toDate(b);
  // 서머타임이 있는 시간대에서도 정확하도록 UTC 자정 기준으로 센다.
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** 1=월 … 7=일 */
export function isoWeekday(date: LocalDate): IsoWeekday {
  const js = toDate(date).getDay(); // 0=일
  return (js === 0 ? 7 : js) as IsoWeekday;
}

export interface DateRange {
  from: LocalDate;
  to: LocalDate; // 포함
}

/** 하루 범위 [그 날짜 dayStartHour:00, 다음 날 dayStartHour:00). */
export function dayRangeMs(
  date: LocalDate,
  dayStartHour: number,
): { start: EpochMs; end: EpochMs } {
  return {
    start: toDate(date, dayStartHour).getTime(),
    end: toDate(addDays(date, 1), dayStartHour).getTime(),
  };
}

/** now가 속한 날의 끝, 즉 다음 날짜 경계 시각(EpochMs). */
export function nextDayBoundary(now: EpochMs, dayStartHour: number): EpochMs {
  return dayRangeMs(todayOf(now, dayStartHour), dayStartHour).end;
}

export function weekRange(date: LocalDate, weekStartsOn: 1 | 7): DateRange {
  const offset = (isoWeekday(date) - weekStartsOn + 7) % 7;
  const from = addDays(date, -offset);
  return { from, to: addDays(from, 6) };
}

export function monthRange(date: LocalDate): DateRange {
  const d = toDate(date);
  return {
    from: makeLocalDate(d.getFullYear(), d.getMonth() + 1, 1),
    to: makeLocalDate(d.getFullYear(), d.getMonth() + 2, 0),
  };
}

export function yearRange(date: LocalDate): DateRange {
  const y = toDate(date).getFullYear();
  return { from: makeLocalDate(y, 1, 1), to: makeLocalDate(y, 12, 31) };
}

/** from~to(포함) 날짜 목록. from > to이면 빈 배열. */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekdayName(weekday: IsoWeekday): string {
  return WEEKDAY_NAMES[weekday - 1] ?? '';
}

/** 예: `10월 3일 토요일` */
export function formatDateLong(date: LocalDate): string {
  const d = toDate(date);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekdayName(isoWeekday(date))}요일`;
}

/** 예: `10월 3일 (토)` */
export function formatDateShort(date: LocalDate): string {
  const d = toDate(date);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdayName(isoWeekday(date))})`;
}

/** 예: `2026년 10월` */
export function formatMonth(date: LocalDate): string {
  const d = toDate(date);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/** 시각(EpochMs)을 로컬 시각 `HH:mm`으로. 예: `09:05` */
export function formatTimeOfDay(time: EpochMs): string {
  const d = new Date(time);
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}
