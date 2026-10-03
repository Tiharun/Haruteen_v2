import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Tooltip } from '../../components/Tooltip';
import {
  addDays,
  eachDay,
  formatDateShort,
  isoWeekday,
  toDate,
  weekdayName,
} from '../../domain/dates';
import { isAchievedValue, isScheduled, loggability, type LogValues } from '../../domain/habits';
import type { Habit, LocalDate } from '../../domain/types';
import { progressLabel } from './labels';
import styles from './MiniLog.module.css';

const DAYS_SHOWN = 7;

export interface MiniLogProps {
  habit: Habit;
  logs: LogValues;
  today: LocalDate;
  /** 횟수형에서 값을 고치는 중인 날 */
  selectedDate: LocalDate;
  onSelect: (date: LocalDate) => void;
  /** 체크형 칸을 눌렀을 때 */
  onToggle: (date: LocalDate) => void;
}

/** 최근 7일(오늘~6일 전) 기록. 기록 가능한 날은 바로 누를 수 있고, 아닌 날은 이유를 툴팁으로 보여 준다. */
export function MiniLog({ habit, logs, today, selectedDate, onSelect, onToggle }: MiniLogProps) {
  const isCheck = habit.goal.type === 'check';
  const dates = eachDay(addDays(today, -(DAYS_SHOWN - 1)), today);

  return (
    <ul
      className={styles.strip}
      aria-label={`${habit.name} 최근 7일`}
      style={{ '--habit-color': `var(--color-${habit.color})` } as CSSProperties}
    >
      {dates.map((date) => {
        const value = logs.get(date) ?? 0;
        const achieved = isAchievedValue(habit.goal, value);
        const allowed = loggability(habit, date, today);
        const scheduled = isScheduled(habit, date);
        const selected = !isCheck && date === selectedDate;

        const state = achieved ? styles.done : value > 0 ? styles.partial : '';
        const cls = [
          styles.cell,
          state,
          !scheduled ? styles.off : '',
          selected ? styles.selected : '',
          date === today ? styles.today : '',
        ]
          .filter(Boolean)
          .join(' ');

        const status = progressLabel(habit.goal, value);
        const label = allowed.ok
          ? `${formatDateShort(date)} ${status}`
          : `${formatDateShort(date)} ${status}, 기록할 수 없음: ${allowed.reason}`;

        const button = (
          <button
            type="button"
            className={cls}
            aria-label={label}
            aria-pressed={isCheck ? achieved : selected}
            aria-disabled={!allowed.ok || undefined}
            onClick={() => {
              if (!allowed.ok) return;
              if (isCheck) onToggle(date);
              else onSelect(date);
            }}
          >
            <span className={styles.weekday}>
              {date === today ? '오늘' : weekdayName(isoWeekday(date))}
            </span>
            <span className={styles.mark}>
              {achieved ? (
                <Check size={16} aria-hidden="true" />
              ) : value > 0 ? (
                value
              ) : (
                toDate(date).getDate()
              )}
            </span>
          </button>
        );

        return (
          <li key={date} className={styles.item}>
            {allowed.ok ? button : <Tooltip text={allowed.reason}>{button}</Tooltip>}
          </li>
        );
      })}
    </ul>
  );
}
