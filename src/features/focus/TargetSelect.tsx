import { Select } from '../../components/Select';
import { sortTasks } from '../../domain/tasks';
import type { FocusTarget, Habit, Task } from '../../domain/types';
import { isScheduled } from '../../domain/habits';
import type { LocalDate } from '../../domain/types';

export interface TargetSelectProps {
  value: FocusTarget;
  disabled: boolean;
  tasks: Task[];
  habits: Habit[];
  today: LocalDate;
  onChange: (target: FocusTarget) => void;
}

function encode(target: FocusTarget): string {
  return target === null ? '' : `${target.type}:${target.id}`;
}

/** 현재 대상이 목록에 없을 때(삭제·완료·오늘 예정 아님) 이름 뒤에 붙일 설명. 목록에 있으면 null. */
function missingNote(
  target: NonNullable<FocusTarget>,
  tasks: Task[],
  habits: Habit[],
  today: LocalDate,
): string | null {
  if (target.type === 'task') {
    const task = tasks.find((t) => t.id === target.id);
    if (!task) return '삭제됨';
    return task.status === 'done' ? '완료됨' : null;
  }
  const habit = habits.find((h) => h.id === target.id);
  if (!habit) return '삭제됨';
  return isScheduled(habit, today) ? null : '오늘 예정 아님';
}

/** 집중 대상 선택: 진행 중인 할 일(지난·오늘 마감 먼저) + 오늘 예정 습관 + 대상 없음. (DESIGN.md §4.4) */
export function TargetSelect({
  value,
  disabled,
  tasks,
  habits,
  today,
  onChange,
}: TargetSelectProps) {
  const openTasks = sortTasks(
    tasks.filter((t) => t.status === 'todo'),
    'due',
  );
  const todayHabits = habits.filter((h) => isScheduled(h, today));
  const note = value === null ? null : missingNote(value, tasks, habits, today);

  const handleChange = (encoded: string) => {
    if (encoded === '') return onChange(null);
    if (value !== null && encoded === encode(value)) return;
    const [type, ...rest] = encoded.split(':');
    const id = rest.join(':');
    if (type === 'task') {
      const task = tasks.find((t) => t.id === id);
      if (task) onChange({ type: 'task', id, titleSnapshot: task.title });
    } else if (type === 'habit') {
      const habit = habits.find((h) => h.id === id);
      if (habit) onChange({ type: 'habit', id, titleSnapshot: habit.name });
    }
  };

  return (
    <Select
      label="집중 대상"
      value={encode(value)}
      disabled={disabled}
      hint={disabled ? '진행 중에는 대상을 바꿀 수 없어요.' : undefined}
      onChange={(e) => handleChange(e.target.value)}
    >
      <option value="">대상 없음</option>
      {value !== null && note !== null && (
        <option value={encode(value)}>
          {value.titleSnapshot} ({note})
        </option>
      )}
      {openTasks.length > 0 && (
        <optgroup label="진행 중인 할 일">
          {openTasks.map((t) => (
            <option key={t.id} value={`task:${t.id}`}>
              {t.title}
            </option>
          ))}
        </optgroup>
      )}
      {todayHabits.length > 0 && (
        <optgroup label="오늘 예정 습관">
          {todayHabits.map((h) => (
            <option key={h.id} value={`habit:${h.id}`}>
              {h.emoji ? `${h.emoji} ` : ''}
              {h.name}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
