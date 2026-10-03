import { useState } from 'react';
import type { Ref } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TodayTaskGroups } from '../../domain/tasks';
import type { ID, LocalDate, Project, Tag, Task } from '../../domain/types';
import { QuickAdd } from '../tasks/QuickAdd';
import { TaskRow } from '../tasks/TaskRow';
import styles from './TodayTasks.module.css';

export interface TodayTasksProps {
  groups: TodayTaskGroups;
  today: LocalDate;
  projectById: ReadonlyMap<ID, Project>;
  tagById: ReadonlyMap<ID, Tag>;
  focusTotals: ReadonlyMap<ID, number> | undefined;
  quickAddRef: Ref<HTMLInputElement>;
  onAdd: (title: string) => Promise<void>;
  onToggle: (task: Task, done: boolean) => void;
  onOpen: (task: Task) => void;
  onStartFocus: (task: Task) => void;
}

interface GroupProps extends Omit<TodayTasksProps, 'groups' | 'quickAddRef' | 'onAdd'> {
  title: string;
  tasks: Task[];
  /** 접을 수 있는 그룹이면 처음에 접혀 있는지 */
  collapsedByDefault?: boolean;
  collapsible?: boolean;
  countLabel?: (n: number) => string;
}

function TaskGroup({
  title,
  tasks,
  collapsible = false,
  collapsedByDefault = false,
  countLabel,
  today,
  projectById,
  tagById,
  focusTotals,
  onToggle,
  onOpen,
  onStartFocus,
}: GroupProps) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (tasks.length === 0) return null;
  const label = countLabel ? countLabel(tasks.length) : `${title} ${tasks.length}`;

  return (
    <section className={styles.group} aria-label={title}>
      {collapsible ? (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ChevronDown size={16} aria-hidden="true" />
          ) : (
            <ChevronRight size={16} aria-hidden="true" />
          )}
          {label}
        </button>
      ) : (
        <h3 className={styles.groupTitle}>{label}</h3>
      )}
      {open && (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              project={task.projectId === null ? undefined : projectById.get(task.projectId)}
              tags={task.tagIds.flatMap((id) => tagById.get(id) ?? [])}
              today={today}
              focusMs={focusTotals?.get(task.id)}
              onToggle={(done) => onToggle(task, done)}
              onOpen={() => onOpen(task)}
              onStartFocus={() => onStartFocus(task)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** 오늘의 할 일: 빠른 추가(마감=오늘) + 지난 / 오늘 마감 / 마감 없음(접힘) / 오늘 완료(접힘). */
export function TodayTasks({ groups, quickAddRef, onAdd, ...rest }: TodayTasksProps) {
  const empty =
    groups.overdue.length === 0 &&
    groups.due.length === 0 &&
    groups.noDue.length === 0 &&
    groups.doneToday.length === 0;

  return (
    <section className={styles.section} aria-labelledby="today-tasks">
      <h2 id="today-tasks" className={styles.heading}>
        오늘의 할 일
      </h2>
      <QuickAdd inputRef={quickAddRef} onAdd={onAdd} />
      {empty && <p className={styles.empty}>오늘 처리할 할 일이 없어요. 위에서 추가해 보세요.</p>}
      <TaskGroup {...rest} title="지난 할 일" tasks={groups.overdue} />
      <TaskGroup {...rest} title="오늘 마감" tasks={groups.due} />
      <TaskGroup
        {...rest}
        title="마감 없음"
        tasks={groups.noDue}
        collapsible
        collapsedByDefault
        countLabel={(n) => `마감 없음 ${n}개`}
      />
      <TaskGroup
        {...rest}
        title="오늘 완료"
        tasks={groups.doneToday}
        collapsible
        collapsedByDefault
        countLabel={(n) => `완료 ${n}개`}
      />
    </section>
  );
}
