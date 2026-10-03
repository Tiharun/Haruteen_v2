import { Check, Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { Tooltip } from '../../components/Tooltip';
import { formatDateShort } from '../../domain/dates';
import { isAchievedValue, type Loggability } from '../../domain/habits';
import type { Habit, LocalDate } from '../../domain/types';
import { LIMITS, validateHabitLogValue } from '../../domain/validation';
import styles from './CountStepper.module.css';

export interface CountStepperProps {
  habit: Habit;
  date: LocalDate;
  value: number;
  /** 이 날 기록할 수 있는지. 막혔다면 이유를 보여 준다. */
  allowed: Loggability;
  onAdjust: (delta: number) => void;
  /** 직접 입력한 값. 숫자가 아니면 NaN이 넘어간다. */
  onSet: (value: number) => void;
}

/** 횟수형 습관의 −/+ 버튼과 직접 입력. */
export function CountStepper({ habit, date, value, allowed, onAdjust, onSet }: CountStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const disabled = !allowed.ok;
  const achieved = isAchievedValue(habit.goal, value);
  const unit = habit.goal.type === 'count' ? habit.goal.unit : '';
  const target = habit.goal.type === 'count' ? habit.goal.target : 1;

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    if (text === '' || Number(text) === value) {
      setDraft(null);
      setError(null);
      return;
    }
    // 잘못된 값은 입력칸 아래에 이유를 보이고, 고칠 수 있게 입력을 남겨 둔다 (§3.7).
    const checked = validateHabitLogValue(Number(text));
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setDraft(null);
    setError(null);
    onSet(checked.value);
  };

  const minus = (
    <IconButton
      className={styles.step}
      aria-label={`${habit.name} 1 줄이기`}
      aria-disabled={disabled || value === 0 || undefined}
      onClick={() => {
        if (!disabled && value > 0) onAdjust(-1);
      }}
    >
      <Minus size={16} aria-hidden="true" />
    </IconButton>
  );
  const plus = (
    <IconButton
      className={styles.step}
      aria-label={`${habit.name} 1 늘리기`}
      aria-disabled={disabled || value >= LIMITS.habitLogValue.max || undefined}
      onClick={() => {
        if (!disabled) onAdjust(1);
      }}
    >
      <Plus size={16} aria-hidden="true" />
    </IconButton>
  );

  return (
    <div
      className={styles.stepper}
      role="group"
      aria-label={`${habit.name} ${formatDateShort(date)} 기록`}
    >
      <span className={styles.date}>{formatDateShort(date)}</span>
      {allowed.ok ? minus : <Tooltip text={allowed.reason}>{minus}</Tooltip>}
      <input
        type="text"
        inputMode="numeric"
        className={styles.input}
        aria-label={`${habit.name} 기록 값`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-disabled={disabled || undefined}
        readOnly={disabled}
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape' && draft !== null) {
            e.stopPropagation();
            setDraft(null);
            setError(null);
          }
        }}
      />
      {allowed.ok ? plus : <Tooltip text={allowed.reason}>{plus}</Tooltip>}
      <span className={styles.goal}>
        / {target}
        {unit}
      </span>
      {achieved && (
        <span className={styles.achieved}>
          <Check size={14} aria-hidden="true" />
          달성
        </span>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
