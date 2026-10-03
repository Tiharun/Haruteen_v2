import { Play } from 'lucide-react';
import { ColorDot } from '../../components/ColorDot';
import { IconButton } from '../../components/IconButton';
import { formatDateShort } from '../../domain/dates';
import { isOverdue } from '../../domain/tasks';
import { formatFocusTime } from '../../domain/stats';
import type { LocalDate, Project, Tag, Task } from '../../domain/types';
import { PRIORITY_LABEL } from './labels';
import styles from './TaskRow.module.css';

const MAX_TAG_CHIPS = 3;

export interface TaskRowProps {
  task: Task;
  project: Project | undefined;
  /** 이 할 일에 붙은 태그(삭제된 id는 걸러진 상태) */
  tags: Tag[];
  today: LocalDate;
  /** 이 할 일에 쌓인 집중 시간(ms). 없으면 표시하지 않는다. */
  focusMs?: number;
  onToggle: (done: boolean) => void;
  onOpen: () => void;
  onStartFocus: () => void;
}

function DueLabel({ task, today }: { task: Task; today: LocalDate }) {
  if (task.dueDate === null) return null;
  const overdue = isOverdue(task, today);
  const isToday = task.dueDate === today && task.status === 'todo';
  const cls = overdue ? styles.overdue : isToday ? styles.today : styles.due;
  return (
    <span className={cls}>
      {overdue && '지남 · '}
      {isToday && '오늘 · '}
      {formatDateShort(task.dueDate)}
    </span>
  );
}

export function TaskRow({
  task,
  project,
  tags,
  today,
  focusMs,
  onToggle,
  onOpen,
  onStartFocus,
}: TaskRowProps) {
  const done = task.status === 'done';
  const subtaskDone = task.subtasks.filter((s) => s.done).length;
  const shownTags = tags.slice(0, MAX_TAG_CHIPS);
  const hiddenTags = tags.length - shownTags.length;

  return (
    <li className={styles.row}>
      <label className={styles.checkHit}>
        <input
          type="checkbox"
          className={styles.check}
          checked={done}
          aria-label={`${task.title} 완료`}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      <button type="button" className={styles.main} onClick={onOpen}>
        <span className={`${styles.title} ${done ? styles.doneTitle : ''}`}>{task.title}</span>
        <span className={styles.meta}>
          {task.subtasks.length > 0 && (
            <span className={styles.progress}>
              하위 {subtaskDone}/{task.subtasks.length}
            </span>
          )}
          <DueLabel task={task} today={today} />
          <span className={task.priority === 'high' ? styles.priorityHigh : styles.priority}>
            우선순위 {PRIORITY_LABEL[task.priority]}
          </span>
          {project && (
            <span className={styles.chip}>
              <ColorDot color={project.color} />
              {project.name}
            </span>
          )}
          {shownTags.map((tag) => (
            <span key={tag.id} className={styles.chip}>
              <ColorDot color={tag.color} />
              {tag.name}
            </span>
          ))}
          {hiddenTags > 0 && <span className={styles.chip}>+{hiddenTags}</span>}
          {focusMs !== undefined && focusMs > 0 && (
            <span className={styles.focusTime}>집중 {formatFocusTime(focusMs)}</span>
          )}
        </span>
      </button>
      {!done && (
        <IconButton
          className={styles.play}
          aria-label={`${task.title} 집중 시작`}
          onClick={onStartFocus}
        >
          <Play size={18} aria-hidden="true" />
        </IconButton>
      )}
    </li>
  );
}
