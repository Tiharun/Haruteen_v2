import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { ColorPicker } from '../../components/ColorPicker';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import type { HabitInput } from '../../db/repositories/habits';
import { parseLocalDate, weekdayName } from '../../domain/dates';
import type {
  ColorKey,
  Habit,
  HabitGoal,
  HabitSchedule,
  IsoWeekday,
  LocalDate,
} from '../../domain/types';
import {
  LIMITS,
  validateCountTarget,
  validateCountUnit,
  validateHabitEmoji,
  validateHabitGoal,
  validateHabitName,
  validateHabitNote,
  validateHabitSchedule,
  validateHabitStartDate,
  ValidationError,
  type Validated,
} from '../../domain/validation';
import fieldStyles from '../../components/Field.module.css';
import styles from './HabitFormDialog.module.css';

const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const WEEKLY_COUNTS = [1, 2, 3, 4, 5, 6];

type ScheduleKind = HabitSchedule['type'];
type GoalKind = HabitGoal['type'];

interface Draft {
  name: string;
  emoji: string;
  color: ColorKey;
  scheduleKind: ScheduleKind;
  days: IsoWeekday[];
  weeklyCount: number;
  goalKind: GoalKind;
  target: string;
  unit: string;
  startDate: string;
  note: string;
}

function initialDraft(habit: Habit | undefined, today: LocalDate): Draft {
  const schedule = habit?.schedule;
  const goal = habit?.goal;
  return {
    name: habit?.name ?? '',
    emoji: habit?.emoji ?? '',
    color: habit?.color ?? 'blue',
    scheduleKind: schedule?.type ?? 'daily',
    days: schedule?.type === 'weekdays' ? schedule.days : [1, 3, 5],
    weeklyCount: schedule?.type === 'weeklyCount' ? schedule.count : 3,
    goalKind: goal?.type ?? 'check',
    target: goal?.type === 'count' ? String(goal.target) : '8',
    unit: goal?.type === 'count' ? goal.unit : '',
    startDate: habit?.startDate ?? today,
    note: habit?.note ?? '',
  };
}

function draftSchedule(draft: Draft): HabitSchedule {
  switch (draft.scheduleKind) {
    case 'daily':
      return { type: 'daily' };
    case 'weekdays':
      return { type: 'weekdays', days: draft.days };
    case 'weeklyCount':
      return { type: 'weeklyCount', count: draft.weeklyCount };
  }
}

/** 입력칸이 비었거나 숫자가 아니면 NaN. 검증 쪽에서 거절한다. */
function parseTarget(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

function draftGoal(draft: Draft): HabitGoal {
  if (draft.goalKind === 'check') return { type: 'check' };
  return { type: 'count', target: parseTarget(draft.target), unit: draft.unit };
}

function errorOf<T>(result: Validated<T>): string | undefined {
  return result.ok ? undefined : result.error;
}

export interface HabitFormDialogProps {
  /** 없으면 새 습관 */
  habit?: Habit;
  today: LocalDate;
  onSubmit: (input: HabitInput) => Promise<void>;
  onClose: () => void;
}

export function HabitFormDialog({ habit, today, onSubmit, onClose }: HabitFormDialogProps) {
  const toast = useToast();
  const formId = useId();
  const [draft, setDraft] = useState(() => initialDraft(habit, today));
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const patch = (changes: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...changes }));

  const name = validateHabitName(draft.name);
  const note = validateHabitNote(draft.note);
  const emoji = validateHabitEmoji(draft.emoji);
  const schedule = validateHabitSchedule(draftSchedule(draft));

  const goal = validateHabitGoal(draftGoal(draft));
  // 횟수형일 때 목표 횟수와 단위 오류를 각 입력 아래에 따로 보여 준다.
  const targetError =
    draft.goalKind === 'count'
      ? errorOf(validateCountTarget(parseTarget(draft.target)))
      : undefined;
  const unitError = draft.goalKind === 'count' ? errorOf(validateCountUnit(draft.unit)) : undefined;

  const parsedStart = parseLocalDate(draft.startDate);
  const startChanged = habit === undefined || draft.startDate !== habit.startDate;
  const startError =
    parsedStart === null
      ? '시작일을 입력해 주세요.'
      : startChanged
        ? errorOf(validateHabitStartDate(parsedStart, today))
        : undefined;

  const valid =
    name.ok && note.ok && emoji.ok && schedule.ok && goal.ok && parsedStart !== null && !startError;

  // 일정·목표를 바꾸면 과거 날짜의 달성 여부와 연속 기록이 새 기준으로 다시 계산된다.
  const rulesChanged =
    habit !== undefined &&
    schedule.ok &&
    goal.ok &&
    (JSON.stringify(schedule.value) !== JSON.stringify(habit.schedule) ||
      JSON.stringify(goal.value) !== JSON.stringify(habit.goal));

  const submit = async () => {
    if (!valid || saving || parsedStart === null) return;
    setSaving(true);
    try {
      await onSubmit({
        name: draft.name,
        note: draft.note,
        color: draft.color,
        emoji: draft.emoji === '' ? null : draft.emoji,
        schedule: draftSchedule(draft),
        goal: draftGoal(draft),
        startDate: parsedStart,
      });
      onClose();
    } catch (error) {
      toast.show({
        message: error instanceof ValidationError ? error.message : '습관을 저장하지 못했어요.',
      });
      setSaving(false);
    }
  };

  return (
    <Modal
      title={habit ? '습관 수정' : '습관 추가'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" form={formId} variant="primary" disabled={!valid || saving}>
            저장
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          label="이름"
          value={draft.name}
          // 한 글자라도 쳤거나 칸을 벗어났으면 이유를 보이고, 비어 있는 새 폼에서는 안내 문구만 둔다.
          error={nameTouched || draft.name !== '' ? errorOf(name) : undefined}
          hint={!nameTouched && draft.name === '' ? '이름을 입력하면 저장할 수 있어요.' : undefined}
          onChange={(e) => patch({ name: e.target.value })}
          onBlur={() => setNameTouched(true)}
          autoComplete="off"
        />

        <div className={styles.pair}>
          <Input
            label="이모지 (선택)"
            value={draft.emoji}
            error={errorOf(emoji)}
            hint="그림 문자 1개"
            onChange={(e) => patch({ emoji: e.target.value })}
            autoComplete="off"
          />
          <ColorPicker value={draft.color} onChange={(color) => patch({ color })} label="색" />
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={fieldStyles.label}>일정</legend>
          <Select
            label="반복"
            value={draft.scheduleKind}
            onChange={(e) => patch({ scheduleKind: e.target.value as ScheduleKind })}
          >
            <option value="daily">매일</option>
            <option value="weekdays">요일 지정</option>
            <option value="weeklyCount">주 N회 (요일 상관없이)</option>
          </Select>
          {draft.scheduleKind === 'weekdays' && (
            <>
              <div className={styles.days} role="group" aria-label="요일 선택">
                {WEEKDAYS.map((day) => {
                  const on = draft.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`${styles.day} ${on ? styles.dayOn : ''}`}
                      aria-pressed={on}
                      aria-label={`${weekdayName(day)}요일`}
                      onClick={() =>
                        patch({
                          days: on ? draft.days.filter((d) => d !== day) : [...draft.days, day],
                        })
                      }
                    >
                      {weekdayName(day)}
                    </button>
                  );
                })}
              </div>
              {!schedule.ok && <p className={fieldStyles.error}>{schedule.error}</p>}
            </>
          )}
          {draft.scheduleKind === 'weeklyCount' && (
            <Select
              label="일주일에"
              value={draft.weeklyCount}
              onChange={(e) => patch({ weeklyCount: Number(e.target.value) })}
            >
              {WEEKLY_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}회
                </option>
              ))}
            </Select>
          )}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={fieldStyles.label}>목표</legend>
          <Select
            label="기록 방식"
            value={draft.goalKind}
            onChange={(e) => patch({ goalKind: e.target.value as GoalKind })}
          >
            <option value="check">체크형 (했다 / 안 했다)</option>
            <option value="count">횟수형 (예: 8잔)</option>
          </Select>
          {draft.goalKind === 'count' && (
            <div className={styles.pair}>
              <Input
                label="목표 횟수"
                type="number"
                inputMode="numeric"
                min={LIMITS.countTarget.min}
                max={LIMITS.countTarget.max}
                value={draft.target}
                error={targetError}
                onChange={(e) => patch({ target: e.target.value })}
              />
              <Input
                label="단위 (선택)"
                value={draft.unit}
                error={unitError}
                hint="예: 잔, 쪽, 분"
                onChange={(e) => patch({ unit: e.target.value })}
                autoComplete="off"
              />
            </div>
          )}
        </fieldset>

        {rulesChanged && (
          <p className={styles.warning} role="status">
            일정이나 목표를 바꾸면 지난 날짜의 달성 여부, 연속 기록, 달성률이 새 기준으로 다시
            계산돼요. 이미 한 기록은 지워지지 않아요.
          </p>
        )}

        <Input
          label="시작일"
          type="date"
          value={draft.startDate}
          error={startError}
          hint={`이 날짜 이전은 계산하지 않아요. 오늘 기준 앞뒤 ${LIMITS.habitStartDateDays}일까지 고를 수 있어요.`}
          onChange={(e) => patch({ startDate: e.target.value })}
        />

        <div className={fieldStyles.field}>
          <label htmlFor={`${formId}-note`} className={fieldStyles.label}>
            메모
          </label>
          <textarea
            id={`${formId}-note`}
            className={styles.note}
            rows={3}
            value={draft.note}
            aria-invalid={note.ok ? undefined : true}
            onChange={(e) => patch({ note: e.target.value })}
          />
          {!note.ok && <p className={fieldStyles.error}>{note.error}</p>}
        </div>
      </form>
    </Modal>
  );
}
