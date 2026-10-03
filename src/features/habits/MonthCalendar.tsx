import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import {
  addDays,
  addMonths,
  compareDates,
  eachDay,
  formatDateLong,
  formatMonth,
  monthRange,
  toDate,
  weekRange,
  weekdayName,
} from '../../domain/dates';
import { dayStatus, loggability, LOG_BACK_DAYS, type LogValues } from '../../domain/habits';
import type { Habit, IsoWeekday, LocalDate } from '../../domain/types';
import { dayStatusLabel } from './labels';
import styles from './MonthCalendar.module.css';

export interface MonthCalendarProps {
  habit: Habit;
  logs: LogValues;
  today: LocalDate;
  weekStartsOn: 1 | 7;
  /** 횟수형에서 값을 고치는 중인 날 */
  selectedDate: LocalDate;
  onSelect: (date: LocalDate) => void;
  /** 체크형 칸을 눌렀을 때 */
  onToggle: (date: LocalDate) => void;
}

/** 월 달력. 기록 가능한 날(오늘-7일~오늘, 예정일)만 눌러서 기록하고, 아닌 날은 이유를 툴팁으로 보여 준다. */
export function MonthCalendar({
  habit,
  logs,
  today,
  weekStartsOn,
  selectedDate,
  onSelect,
  onToggle,
}: MonthCalendarProps) {
  const [month, setMonth] = useState<LocalDate>(today);
  const isCheck = habit.goal.type === 'check';
  const { from, to } = monthRange(month);
  const days = eachDay(weekRange(from, weekStartsOn).from, weekRange(to, weekStartsOn).to);
  const heads = Array.from(
    { length: 7 },
    (_, i) => (((weekStartsOn - 1 + i) % 7) + 1) as IsoWeekday,
  );

  return (
    <div
      className={styles.wrap}
      style={{ '--habit-color': `var(--color-${habit.color})` } as CSSProperties}
    >
      <div className={styles.nav}>
        <IconButton aria-label="이전 달" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={18} aria-hidden="true" />
        </IconButton>
        <h3 className={styles.month} aria-live="polite">
          {formatMonth(month)}
        </h3>
        <IconButton aria-label="다음 달" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={18} aria-hidden="true" />
        </IconButton>
      </div>

      <ul className={styles.grid} aria-label={`${formatMonth(month)} 기록 달력`}>
        {heads.map((weekday) => (
          <li key={weekday} className={styles.head} aria-hidden="true">
            {weekdayName(weekday)}
          </li>
        ))}
        {days.map((date) => {
          if (compareDates(date, from) < 0 || compareDates(date, to) > 0) {
            return <li key={date} className={styles.blank} aria-hidden="true" />;
          }
          const status = dayStatus(habit, logs, date, today);
          const allowed = loggability(habit, date, today);
          const selected = !isCheck && date === selectedDate;
          const cls = [
            styles.cell,
            status.kind === 'done' ? styles.done : '',
            status.kind === 'partial' ? styles.partial : '',
            status.kind === 'off' || status.kind === 'untracked' || status.kind === 'blank'
              ? styles.off
              : '',
            selected ? styles.selected : '',
            date === today ? styles.today : '',
          ]
            .filter(Boolean)
            .join(' ');
          const text = `${formatDateLong(date)}, ${dayStatusLabel(habit, status)}`;
          const label = allowed.ok ? text : `${text}, 기록할 수 없음: ${allowed.reason}`;

          const button = (
            <button
              type="button"
              className={cls}
              aria-label={label}
              aria-pressed={isCheck ? status.kind === 'done' : selected}
              aria-disabled={!allowed.ok || undefined}
              onClick={() => {
                if (!allowed.ok) return;
                if (isCheck) onToggle(date);
                else onSelect(date);
              }}
            >
              <span className={styles.day}>{toDate(date).getDate()}</span>
              <span className={styles.mark}>
                {status.kind === 'done' ? (
                  <Check size={14} aria-hidden="true" />
                ) : status.value > 0 ? (
                  status.value
                ) : null}
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
      <p className={styles.hint}>
        오늘부터 {LOG_BACK_DAYS}일 전까지의 예정일만 눌러서 기록할 수 있어요. (
        {formatDateLong(addDays(today, -LOG_BACK_DAYS))}부터)
      </p>
    </div>
  );
}
