import { Play } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { IconButton } from '../../components/IconButton';
import {
  isAchievedValue,
  loggability,
  type Streak,
  type WeeklyProgress,
} from '../../domain/habits';
import type { Habit, LocalDate } from '../../domain/types';
import { CountStepper } from '../habits/CountStepper';
import { streakUnit } from '../habits/labels';
import styles from './TodayHabitRow.module.css';

export interface TodayHabitRowProps {
  habit: Habit;
  today: LocalDate;
  /** 오늘 기록 값(없으면 0) */
  value: number;
  streak: Streak;
  /** weeklyCount 습관의 이번 주 진행 */
  weekly: WeeklyProgress | null;
  onToggle: () => void;
  onAdjust: (delta: number) => void;
  onSetValue: (value: number) => void;
  onStartFocus: () => void;
}

export function TodayHabitRow({
  habit,
  today,
  value,
  streak,
  weekly,
  onToggle,
  onAdjust,
  onSetValue,
  onStartFocus,
}: TodayHabitRowProps) {
  const achieved = isAchievedValue(habit.goal, value);
  const unit = streakUnit(habit);

  return (
    <li
      className={styles.row}
      style={{ '--habit-color': `var(--color-${habit.color})` } as CSSProperties}
    >
      <div className={styles.line}>
        {habit.goal.type === 'check' && (
          <label className={styles.checkHit}>
            <input
              type="checkbox"
              className={styles.check}
              checked={achieved}
              aria-label={`${habit.name} 오늘 달성`}
              onChange={onToggle}
            />
          </label>
        )}
        <span className={styles.emoji} aria-hidden="true">
          {habit.emoji ?? ''}
        </span>
        <div className={styles.main}>
          <Link to={`/habits/${habit.id}`} className={styles.name}>
            {habit.name}
          </Link>
          <span className={styles.meta}>
            {weekly && (
              <span>
                이번 주 {weekly.done}/{weekly.required}
              </span>
            )}
            <span aria-label={`연속 ${streak.current}${unit}`}>
              <span aria-hidden="true">🔥</span> {streak.current}
              {unit}
            </span>
          </span>
        </div>
        <IconButton aria-label={`${habit.name} 집중 시작`} onClick={onStartFocus}>
          <Play size={18} aria-hidden="true" />
        </IconButton>
      </div>
      {habit.goal.type === 'count' && (
        <CountStepper
          habit={habit}
          date={today}
          value={value}
          allowed={loggability(habit, today, today)}
          onAdjust={onAdjust}
          onSet={onSetValue}
        />
      )}
    </li>
  );
}
