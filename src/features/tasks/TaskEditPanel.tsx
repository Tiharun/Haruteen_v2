import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { ColorDot } from '../../components/ColorDot';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import {
  addSubtask,
  deleteTask,
  removeSubtask,
  setTaskDone,
  updateSubtask,
  toggleTaskTag,
  updateTask,
  type TaskPatch,
} from '../../db/repositories/tasks';
import { parseDueInput } from '../../domain/tasks';
import type { Priority, Project, Subtask, Tag, Task } from '../../domain/types';
import {
  LIMITS,
  validateSubtaskTitle,
  validateTaskNote,
  validateTaskTitle,
  ValidationError,
} from '../../domain/validation';
import { PRIORITY_LABEL } from './labels';
import { TaskFocusHistory } from './TaskFocusHistory';
import fieldStyles from '../../components/Field.module.css';
import styles from './TaskEditPanel.module.css';

const SAVE_DELAY_MS = 500;
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export interface TaskEditPanelProps {
  task: Task;
  projects: Project[];
  tags: Tag[];
  onClose: () => void;
  onStartFocus: () => void;
}

function SubtaskRow({ taskId, subtask }: { taskId: string; subtask: Subtask }) {
  const toast = useToast();
  const [title, setTitle] = useState(subtask.title);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const error = validateSubtaskTitle(title);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value === null || !validateSubtaskTitle(value).ok) return;
    updateSubtask(taskId, subtask.id, { title: value }).catch(() =>
      toast.show({ message: '하위 할 일을 저장하지 못했어요.' }),
    );
  }, [taskId, subtask.id, toast]);

  // 패널을 닫거나 항목이 사라질 때 기다리던 입력을 바로 저장한다.
  useEffect(() => flush, [flush]);

  return (
    <li className={styles.subtask}>
      <label className={styles.checkHit}>
        <input
          type="checkbox"
          className={styles.check}
          checked={subtask.done}
          aria-label={`${subtask.title} 완료`}
          onChange={(e) =>
            void updateSubtask(taskId, subtask.id, { done: e.target.checked }).catch(() =>
              toast.show({ message: '하위 할 일을 저장하지 못했어요.' }),
            )
          }
        />
      </label>
      <div className={styles.subtaskTitle}>
        <input
          className={`${fieldStyles.control} ${subtask.done ? styles.doneInput : ''}`}
          aria-label="하위 할 일 제목"
          aria-invalid={error.ok ? undefined : true}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            pending.current = e.target.value;
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
          }}
        />
        {!error.ok && <p className={fieldStyles.error}>{error.error}</p>}
      </div>
      <IconButton
        aria-label={`${subtask.title} 삭제`}
        onClick={() =>
          void removeSubtask(taskId, subtask.id).catch(() =>
            toast.show({ message: '하위 할 일을 삭제하지 못했어요.' }),
          )
        }
      >
        <Trash2 size={16} aria-hidden="true" />
      </IconButton>
    </li>
  );
}

export function TaskEditPanel({ task, projects, tags, onClose, onStartFocus }: TaskEditPanelProps) {
  const toast = useToast();
  const noteId = useId();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note);
  const [newSubtask, setNewSubtask] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pending = useRef<{ title?: string; note?: string }>({});
  const timer = useRef<number | undefined>(undefined);

  const taskId = task.id;
  const save = useCallback(
    (patch: TaskPatch) =>
      updateTask(taskId, patch).catch((error: unknown) => {
        toast.show({
          message: error instanceof ValidationError ? error.message : '저장하지 못했어요.',
        });
      }),
    [taskId, toast],
  );

  // 텍스트는 입력을 멈춘 뒤 500ms에 저장하고, 패널을 닫을 때는 즉시 저장한다. 검증에 실패한 값은 저장하지 않는다.
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const { title: t, note: n } = pending.current;
    pending.current = {};
    const patch: TaskPatch = {};
    if (t !== undefined && validateTaskTitle(t).ok) patch.title = t;
    if (n !== undefined && validateTaskNote(n).ok) patch.note = n;
    if (Object.keys(patch).length > 0) void save(patch);
  }, [save]);

  useEffect(() => flush, [flush]);

  const schedule = (field: 'title' | 'note', value: string) => {
    pending.current[field] = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const titleCheck = validateTaskTitle(title);
  const noteCheck = validateTaskNote(note);
  const newSubtaskCheck = validateSubtaskTitle(newSubtask);
  const subtaskLimitReached = task.subtasks.length >= LIMITS.maxSubtasksPerTask;
  const tagLimitReached = task.tagIds.length >= LIMITS.maxTagsPerTask;

  const submitSubtask = async () => {
    if (!newSubtaskCheck.ok || subtaskLimitReached) return;
    try {
      await addSubtask(taskId, newSubtask);
      setNewSubtask('');
    } catch (error) {
      toast.show({
        message:
          error instanceof ValidationError ? error.message : '하위 할 일을 추가하지 못했어요.',
      });
    }
  };

  const toggleTag = (id: string) => {
    toggleTaskTag(taskId, id).catch((error: unknown) => {
      toast.show({
        message: error instanceof ValidationError ? error.message : '저장하지 못했어요.',
      });
    });
  };

  return (
    <>
      <Sheet
        title="할 일 편집"
        onClose={onClose}
        footer={
          <>
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              삭제
            </Button>
            <Button onClick={onClose}>닫기</Button>
          </>
        }
      >
        <div className={styles.form}>
          <label className={styles.doneRow}>
            <input
              type="checkbox"
              className={styles.check}
              checked={task.status === 'done'}
              onChange={(e) =>
                void setTaskDone(taskId, e.target.checked).catch(() =>
                  toast.show({ message: '저장하지 못했어요.' }),
                )
              }
            />
            완료
          </label>

          <Input
            label="제목"
            value={title}
            error={titleCheck.ok ? undefined : titleCheck.error}
            onChange={(e) => {
              setTitle(e.target.value);
              schedule('title', e.target.value);
            }}
          />

          <div className={fieldStyles.field}>
            <label htmlFor={noteId} className={fieldStyles.label}>
              메모
            </label>
            <textarea
              id={noteId}
              className={styles.note}
              rows={4}
              value={note}
              aria-invalid={noteCheck.ok ? undefined : true}
              onChange={(e) => {
                setNote(e.target.value);
                schedule('note', e.target.value);
              }}
            />
            {!noteCheck.ok && <p className={fieldStyles.error}>{noteCheck.error}</p>}
          </div>

          <div className={styles.pair}>
            <Select
              label="우선순위"
              value={task.priority}
              onChange={(e) => void save({ priority: e.target.value as Priority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
            <Input
              label="마감일"
              type="date"
              value={task.dueDate ?? ''}
              onChange={(e) => {
                const due = parseDueInput(e.target.value);
                if (due !== undefined) void save({ dueDate: due });
              }}
            />
          </div>

          <Select
            label="프로젝트"
            value={task.projectId ?? ''}
            onChange={(e) =>
              void save({ projectId: e.target.value === '' ? null : e.target.value })
            }
          >
            <option value="">프로젝트 없음</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <fieldset className={styles.fieldset}>
            <legend className={fieldStyles.label}>
              태그 ({task.tagIds.length}/{LIMITS.maxTagsPerTask})
            </legend>
            {tags.length === 0 ? (
              <p className={fieldStyles.hint}>
                태그가 없어요. 목록 위의 “관리”에서 만들 수 있어요.
              </p>
            ) : (
              <div className={styles.tagList}>
                {tags.map((tag) => {
                  const on = task.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!on && tagLimitReached}
                      className={`${styles.tag} ${on ? styles.tagOn : ''}`}
                      onClick={() => toggleTag(tag.id)}
                    >
                      <ColorDot color={tag.color} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
            {tagLimitReached && (
              <p className={fieldStyles.hint}>
                태그는 할 일당 {LIMITS.maxTagsPerTask}개까지 붙일 수 있어요.
              </p>
            )}
          </fieldset>

          <section aria-labelledby={`${noteId}-sub`} className={styles.subtasks}>
            <h3 id={`${noteId}-sub`} className={fieldStyles.label}>
              하위 할 일 ({task.subtasks.length}/{LIMITS.maxSubtasksPerTask})
            </h3>
            {task.subtasks.length > 0 && (
              <ul className={styles.subtaskList}>
                {task.subtasks.map((s) => (
                  <SubtaskRow key={s.id} taskId={taskId} subtask={s} />
                ))}
              </ul>
            )}
            <form
              className={styles.addSubtask}
              onSubmit={(e) => {
                e.preventDefault();
                void submitSubtask();
              }}
            >
              <div className={styles.subtaskTitle}>
                <Input
                  label="하위 할 일 추가"
                  value={newSubtask}
                  disabled={subtaskLimitReached}
                  hint={
                    subtaskLimitReached
                      ? `하위 할 일은 ${LIMITS.maxSubtasksPerTask}개까지 만들 수 있어요.`
                      : undefined
                  }
                  error={
                    newSubtask !== '' && !newSubtaskCheck.ok ? newSubtaskCheck.error : undefined
                  }
                  onChange={(e) => setNewSubtask(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={!newSubtaskCheck.ok || subtaskLimitReached}
                className={styles.addButton}
              >
                추가
              </Button>
            </form>
          </section>

          <TaskFocusHistory
            taskId={taskId}
            canStart={task.status === 'todo'}
            onStartFocus={onStartFocus}
          />
        </div>
      </Sheet>

      {confirmingDelete && (
        <ConfirmDialog
          title="할 일을 삭제할까요?"
          message={`“${task.title}”을(를) 삭제해요. 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          danger
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            pending.current = {};
            window.clearTimeout(timer.current);
            deleteTask(taskId).then(
              () => onClose(),
              () => toast.show({ message: '삭제하지 못했어요.' }),
            );
            setConfirmingDelete(false);
          }}
        />
      )}
    </>
  );
}
