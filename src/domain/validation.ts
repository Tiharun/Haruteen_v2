// DESIGN.md §3.7 입력 제한. 제한값 상수, 문자열 정규화, 할 일·프로젝트·태그·습관 검증.
import { diffDays } from './dates';
import type { HabitGoal, HabitSchedule, IsoWeekday, LocalDate } from './types';

export interface LengthRange {
  min: number;
  max: number;
}

export const LIMITS = {
  taskTitle: { min: 1, max: 200 },
  taskNote: { min: 0, max: 5000 },
  subtaskTitle: { min: 1, max: 200 },
  maxSubtasksPerTask: 50,
  maxTagsPerTask: 10,
  projectName: { min: 1, max: 30 },
  tagName: { min: 1, max: 30 },
  maxProjects: 50,
  maxTags: 50,
  habitName: { min: 1, max: 50 },
  habitNote: { min: 0, max: 1000 },
  countTarget: { min: 2, max: 999 },
  countUnit: { min: 0, max: 10 },
  habitLogValue: { min: 0, max: 9999 },
  habitStartDateDays: 365,
  focusMinutes: { min: 1, max: 120 },
  shortBreakMinutes: { min: 1, max: 30 },
  longBreakMinutes: { min: 1, max: 60 },
  longBreakInterval: { min: 2, max: 10 },
  soundVolume: { min: 0, max: 100 },
  dayStartHour: { min: 0, max: 6 },
} as const;

/** 저장 전 문자열 정리: trim + NFC 정규화. */
export function normalizeText(text: string): string {
  return text.trim().normalize('NFC');
}

// ---- 할 일 · 프로젝트 · 태그 (M2) ----

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

/** repository가 검증에 실패한 입력을 받았을 때 던진다. message는 사용자에게 보여 줄 수 있다. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** 글자 수(그래핌이 아니라 코드 포인트 기준). 이모지가 2자로 세어지지 않게 한다. */
function charCount(text: string): number {
  return Array.from(text).length;
}

function checkLength(
  raw: string,
  range: LengthRange,
  messages: { empty: string; tooLong: string },
): Validated<string> {
  const value = normalizeText(raw);
  const length = charCount(value);
  if (length < range.min) return { ok: false, error: messages.empty };
  if (length > range.max) {
    return { ok: false, error: `${messages.tooLong} (${length}/${range.max}자)` };
  }
  return { ok: true, value };
}

export function validateTaskTitle(raw: string): Validated<string> {
  return checkLength(raw, LIMITS.taskTitle, {
    empty: '제목을 입력해 주세요.',
    tooLong: `제목은 ${LIMITS.taskTitle.max}자까지 쓸 수 있어요.`,
  });
}

export function validateTaskNote(raw: string): Validated<string> {
  return checkLength(raw, LIMITS.taskNote, {
    empty: '',
    tooLong: `메모는 ${LIMITS.taskNote.max.toLocaleString('ko-KR')}자까지 쓸 수 있어요.`,
  });
}

export function validateSubtaskTitle(raw: string): Validated<string> {
  return checkLength(raw, LIMITS.subtaskTitle, {
    empty: '하위 할 일 제목을 입력해 주세요.',
    tooLong: `하위 할 일 제목은 ${LIMITS.subtaskTitle.max}자까지 쓸 수 있어요.`,
  });
}

export function validateSubtaskCount(count: number): Validated<number> {
  return count > LIMITS.maxSubtasksPerTask
    ? { ok: false, error: `하위 할 일은 ${LIMITS.maxSubtasksPerTask}개까지 만들 수 있어요.` }
    : { ok: true, value: count };
}

export function validateTaskTagCount(count: number): Validated<number> {
  return count > LIMITS.maxTagsPerTask
    ? { ok: false, error: `태그는 할 일당 ${LIMITS.maxTagsPerTask}개까지 붙일 수 있어요.` }
    : { ok: true, value: count };
}

function validateName(
  raw: string,
  kind: '프로젝트' | '태그',
  range: LengthRange,
  otherNames: readonly string[],
): Validated<string> {
  const result = checkLength(raw, range, {
    empty: `${kind} 이름을 입력해 주세요.`,
    tooLong: `${kind} 이름은 ${range.max}자까지 쓸 수 있어요.`,
  });
  if (!result.ok) return result;
  const key = result.value.toLowerCase();
  if (otherNames.some((name) => normalizeText(name).toLowerCase() === key)) {
    return { ok: false, error: `같은 이름의 ${kind}가 이미 있어요.` };
  }
  return result;
}

/** otherNames: 자기 자신을 뺀 기존 이름들. 대소문자를 무시하고 중복을 거른다. */
export function validateProjectName(raw: string, otherNames: readonly string[]): Validated<string> {
  return validateName(raw, '프로젝트', LIMITS.projectName, otherNames);
}

export function validateTagName(raw: string, otherNames: readonly string[]): Validated<string> {
  return validateName(raw, '태그', LIMITS.tagName, otherNames);
}

/** 새로 만들기 전 개수 제한 확인. existingCount는 지금 있는 개수. */
export function validateCanAddProject(existingCount: number): Validated<number> {
  return existingCount >= LIMITS.maxProjects
    ? { ok: false, error: `프로젝트는 ${LIMITS.maxProjects}개까지 만들 수 있어요.` }
    : { ok: true, value: existingCount };
}

export function validateCanAddTag(existingCount: number): Validated<number> {
  return existingCount >= LIMITS.maxTags
    ? { ok: false, error: `태그는 ${LIMITS.maxTags}개까지 만들 수 있어요.` }
    : { ok: true, value: existingCount };
}

// ---- 습관 (M3) ----

export function validateHabitName(raw: string): Validated<string> {
  return checkLength(raw, LIMITS.habitName, {
    empty: '습관 이름을 입력해 주세요.',
    tooLong: `습관 이름은 ${LIMITS.habitName.max}자까지 쓸 수 있어요.`,
  });
}

export function validateHabitNote(raw: string): Validated<string> {
  return checkLength(raw, LIMITS.habitNote, {
    empty: '',
    tooLong: `메모는 ${LIMITS.habitNote.max.toLocaleString('ko-KR')}자까지 쓸 수 있어요.`,
  });
}

/** 이모지는 그래핌 1개 또는 없음(null). 공백뿐이면 없음으로 본다. */
export function validateHabitEmoji(raw: string | null): Validated<string | null> {
  const value = normalizeText(raw ?? '');
  if (value === '') return { ok: true, value: null };
  const graphemes = Array.from(new Intl.Segmenter().segment(value));
  if (graphemes.length > 1) return { ok: false, error: '이모지는 1개만 쓸 수 있어요.' };
  return { ok: true, value };
}

/** 횟수형 목표 횟수: 정수 2~999. */
export function validateCountTarget(value: number): Validated<number> {
  const { min, max } = LIMITS.countTarget;
  return Number.isInteger(value) && value >= min && value <= max
    ? { ok: true, value }
    : { ok: false, error: `목표 횟수는 ${min}~${max} 사이의 정수로 입력해 주세요.` };
}

/** 횟수형 단위: 0~10자. */
export function validateCountUnit(raw: string): Validated<string> {
  return checkLength(raw, LIMITS.countUnit, {
    empty: '',
    tooLong: `단위는 ${LIMITS.countUnit.max}자까지 쓸 수 있어요.`,
  });
}

/** 습관 기록 값: 정수 0~9,999. */
export function validateHabitLogValue(value: number): Validated<number> {
  const { min, max } = LIMITS.habitLogValue;
  return Number.isInteger(value) && value >= min && value <= max
    ? { ok: true, value }
    : {
        ok: false,
        error: `기록 값은 ${min}~${max.toLocaleString('ko-KR')} 사이의 정수로 입력해 주세요.`,
      };
}

/** 습관 시작일: 오늘 기준 ±365일. */
export function validateHabitStartDate(date: LocalDate, today: LocalDate): Validated<LocalDate> {
  const days = LIMITS.habitStartDateDays;
  return Math.abs(diffDays(today, date)) <= days
    ? { ok: true, value: date }
    : { ok: false, error: `시작일은 오늘 기준 앞뒤 ${days}일 안에서 골라 주세요.` };
}

const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** 일정을 검증하고 저장 형태로 바꾼다: 요일은 오름차순·중복 없음, 7개 모두면 daily. */
export function validateHabitSchedule(schedule: HabitSchedule): Validated<HabitSchedule> {
  switch (schedule.type) {
    case 'daily':
      return { ok: true, value: { type: 'daily' } };
    case 'weekdays': {
      const days = WEEKDAYS.filter((d) => schedule.days.includes(d));
      if (days.length === 0) return { ok: false, error: '요일을 하나 이상 골라 주세요.' };
      if (days.length === WEEKDAYS.length) return { ok: true, value: { type: 'daily' } };
      return { ok: true, value: { type: 'weekdays', days } };
    }
    case 'weeklyCount':
      return Number.isInteger(schedule.count) && schedule.count >= 1 && schedule.count <= 6
        ? { ok: true, value: { type: 'weeklyCount', count: schedule.count } }
        : { ok: false, error: '주 횟수는 1~6회 중에서 골라 주세요.' };
  }
}

export function validateHabitGoal(goal: HabitGoal): Validated<HabitGoal> {
  if (goal.type === 'check') return { ok: true, value: { type: 'check' } };
  const target = validateCountTarget(goal.target);
  if (!target.ok) return target;
  const unit = validateCountUnit(goal.unit);
  if (!unit.ok) return unit;
  return { ok: true, value: { type: 'count', target: target.value, unit: unit.value } };
}

// ---- 타이머 설정 (M4) ----

export type TimerSettingKey =
  'focusMinutes' | 'shortBreakMinutes' | 'longBreakMinutes' | 'longBreakInterval';

const TIMER_SETTING_LABEL: Record<TimerSettingKey, { name: string; unit: string }> = {
  focusMinutes: { name: '집중 시간', unit: '분' },
  shortBreakMinutes: { name: '짧은 휴식', unit: '분' },
  longBreakMinutes: { name: '긴 휴식', unit: '분' },
  longBreakInterval: { name: '긴 휴식 간격', unit: '회' },
};

/** 타이머 설정값: §3.5 범위의 정수. */
export function validateTimerSetting(key: TimerSettingKey, value: number): Validated<number> {
  const { min, max } = LIMITS[key];
  const { name, unit } = TIMER_SETTING_LABEL[key];
  return Number.isInteger(value) && value >= min && value <= max
    ? { ok: true, value }
    : { ok: false, error: `${name}은(는) ${min}~${max}${unit} 사이의 정수로 입력해 주세요.` };
}

/** 입력창 글자를 숫자로 검증한다. 숫자 외 글자·빈 값은 실패. */
export function validateTimerSettingText(key: TimerSettingKey, text: string): Validated<number> {
  const trimmed = text.trim();
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  return validateTimerSetting(key, value);
}

/** Validated를 풀어서 값을 돌려주거나, 실패면 ValidationError를 던진다. */
export function unwrap<T>(result: Validated<T>): T {
  if (!result.ok) throw new ValidationError(result.error);
  return result.value;
}
