import { weekdayName } from '../../domain/dates';
import type { DayStatus } from '../../domain/habits';
import type { Habit, HabitGoal, HabitSchedule } from '../../domain/types';

/** 예: `매일` / `월·수·금` / `주 3회` */
export function scheduleLabel(schedule: HabitSchedule): string {
  switch (schedule.type) {
    case 'daily':
      return '매일';
    case 'weekdays':
      return schedule.days.map(weekdayName).join('·');
    case 'weeklyCount':
      return `주 ${schedule.count}회`;
  }
}

/** 예: `체크` / `8잔` */
export function goalLabel(goal: HabitGoal): string {
  return goal.type === 'check' ? '체크' : `${goal.target}${goal.unit}`;
}

/** 횟수형 값 표시. 예: `3/8잔` */
export function progressLabel(goal: HabitGoal, value: number): string {
  return goal.type === 'check' ? (value > 0 ? '달성' : '미달성') : `${value}/${goalLabel(goal)}`;
}

/** 연속 기록 단위. daily·weekdays는 일, weeklyCount는 주 */
export function streakUnit(habit: Habit): '일' | '주' {
  return habit.schedule.type === 'weeklyCount' ? '주' : '일';
}

/** 히트맵·달력 칸의 상태 설명. 예: `달성 8/8잔`, `일부 3/8잔`, `미달성` */
export function dayStatusLabel(habit: Habit, status: DayStatus): string {
  const count = habit.goal.type === 'count';
  switch (status.kind) {
    case 'done':
      return count ? `달성 ${progressLabel(habit.goal, status.value)}` : '달성';
    case 'partial':
      return `일부 ${progressLabel(habit.goal, status.value)}`;
    case 'missed':
      return '미달성';
    case 'blank':
      return '기록 없음';
    case 'off':
      return '예정일 아님';
    case 'untracked':
      return '기록 대상 아님';
    case 'future':
      return '아직 오지 않음';
  }
}
