import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { addDays, formatDateShort } from '../../domain/dates';
import { achievementRate, loggability, streak, toLogValues } from '../../domain/habits';
import type { Habit, HabitLog, LocalDate } from '../../domain/types';
import { CountStepper } from './CountStepper';
import { goalLabel, scheduleLabel, streakUnit } from './labels';
import { MiniLog } from './MiniLog';
import styles from './HabitCard.module.css';

const RATE_DAYS = 30;

export interface HabitCardProps {
  habit: Habit;
  /** 이 습관의 기록만 */
  logs: HabitLog[];
  today: LocalDate;
  weekStartsOn: 1 | 7;
  /** 보관함에서는 기록 칸과 수정·순서 이동을 보여 주지 않는다 */
  archived: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onToggle: (date: LocalDate) => void;
  onAdjust: (date: LocalDate, delta: number) => void;
  onSetValue: (date: LocalDate, value: number) => void;
}

export function HabitCard({
  habit,
  logs,
  today,
  weekStartsOn,
  archived,
  isFirst,
  isLast,
  onMove,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onToggle,
  onAdjust,
  onSetValue,
}: HabitCardProps) {
  const [picked, setPicked] = useState<LocalDate | null>(null);
  const selectedDate = picked ?? today;

  const logValues = useMemo(() => toLogValues(logs), [logs]);
  const summary = useMemo(() => {
    const { current, best } = streak(habit, logValues, today, weekStartsOn);
    const rate = achievementRate(
      habit,
      logValues,
      addDays(today, -(RATE_DAYS - 1)),
      today,
      today,
      weekStartsOn,
    );
    return { current, best, rate: rate.rate };
  }, [habit, logValues, today, weekStartsOn]);

  const unit = streakUnit(habit);
  const rateText = summary.rate === null ? '기록 없음' : `${Math.round(summary.rate * 100)}%`;
  const countLog = logValues.get(selectedDate) ?? 0;

  return (
    <li
      className={styles.card}
      style={{ '--habit-color': `var(--color-${habit.color})` } as CSSProperties}
    >
      <div className={styles.head}>
        <span className={styles.emoji} aria-hidden="true">
          {habit.emoji ?? ''}
        </span>
        <div className={styles.titleBlock}>
          <h2 className={styles.name}>
            <Link to={`/habits/${habit.id}`} className={styles.nameLink}>
              {habit.name}
            </Link>
          </h2>
          <p className={styles.sub}>
            {scheduleLabel(habit.schedule)} · 목표 {goalLabel(habit.goal)}
            {archived &&
              habit.archivedOn !== null &&
              ` · ${formatDateShort(habit.archivedOn)} 보관`}
          </p>
        </div>
        <div className={styles.actions}>
          {archived ? (
            <Button size="sm" onClick={onRestore}>
              <ArchiveRestore size={16} aria-hidden="true" />
              복원
            </Button>
          ) : (
            <>
              <IconButton
                aria-label={`${habit.name} 위로 이동`}
                disabled={isFirst}
                onClick={() => onMove(-1)}
              >
                <ChevronUp size={18} aria-hidden="true" />
              </IconButton>
              <IconButton
                aria-label={`${habit.name} 아래로 이동`}
                disabled={isLast}
                onClick={() => onMove(1)}
              >
                <ChevronDown size={18} aria-hidden="true" />
              </IconButton>
              <IconButton aria-label={`${habit.name} 수정`} onClick={onEdit}>
                <Pencil size={16} aria-hidden="true" />
              </IconButton>
              <IconButton aria-label={`${habit.name} 보관`} onClick={onArchive}>
                <Archive size={16} aria-hidden="true" />
              </IconButton>
            </>
          )}
          <IconButton aria-label={`${habit.name} 삭제`} onClick={onDelete}>
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>현재 연속</dt>
          <dd>
            {summary.current}
            {unit}
          </dd>
        </div>
        <div>
          <dt>최고 연속</dt>
          <dd>
            {summary.best}
            {unit}
          </dd>
        </div>
        <div>
          <dt>최근 {RATE_DAYS}일 달성률</dt>
          <dd>{rateText}</dd>
        </div>
      </dl>

      {!archived && (
        <>
          <MiniLog
            habit={habit}
            logs={logValues}
            today={today}
            selectedDate={selectedDate}
            onSelect={setPicked}
            onToggle={onToggle}
          />
          {habit.goal.type === 'count' && (
            <CountStepper
              habit={habit}
              date={selectedDate}
              value={countLog}
              allowed={loggability(habit, selectedDate, today)}
              onAdjust={(delta) => onAdjust(selectedDate, delta)}
              onSet={(value) => onSetValue(selectedDate, value)}
            />
          )}
        </>
      )}
    </li>
  );
}
