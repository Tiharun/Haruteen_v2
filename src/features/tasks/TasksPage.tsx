import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { useFocusTotals } from '../../db/repositories/focus';
import { useProjectsQuery } from '../../db/repositories/projects';
import { useTagsQuery } from '../../db/repositories/tags';
import {
  createTask,
  deleteDoneTasks,
  setTaskDone,
  useDoneTaskCount,
  useTasksQuery,
} from '../../db/repositories/tasks';
import {
  DEFAULT_TASK_QUERY,
  hasActiveFilters,
  parseTaskQuery,
  queryTasks,
  toSearchParams,
  type TaskQuery,
} from '../../domain/tasks';
import { ValidationError } from '../../domain/validation';
import { useSettings } from '../../hooks/useSettings';
import { useShortcut } from '../../hooks/useShortcut';
import { useStartFocus } from '../../hooks/useTimer';
import { useToday } from '../../hooks/useToday';
import { FilterBar } from './FilterBar';
import { ManageDialog } from './ManageDialog';
import { QuickAdd } from './QuickAdd';
import { TaskEditPanel } from './TaskEditPanel';
import { TaskRow } from './TaskRow';
import styles from './TasksPage.module.css';

export function TasksPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { settings } = useSettings();
  const today = useToday(settings.dayStartHour);
  const tasks = useTasksQuery();
  const projects = useProjectsQuery();
  const tags = useTagsQuery();
  const doneCount = useDoneTaskCount();
  const focusTotals = useFocusTotals();
  const startFocus = useStartFocus();

  const quickAddRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useShortcut({
    keys: 'N',
    code: 'KeyN',
    description: '새 할 일 입력창으로 이동',
    handler: () => quickAddRef.current?.focus(),
  });
  useShortcut({
    keys: '/',
    code: 'Slash',
    description: '검색창으로 이동',
    handler: () => searchRef.current?.focus(),
  });

  const rawQuery = useMemo(() => parseTaskQuery(params), [params]);

  // 주소에 남은 id가 이미 지워진 프로젝트·태그면 무시한다.
  const query = useMemo<TaskQuery>(() => {
    if (!projects || !tags) return rawQuery;
    const projectOk =
      rawQuery.project === 'all' ||
      rawQuery.project === 'none' ||
      projects.some((p) => p.id === rawQuery.project);
    return {
      ...rawQuery,
      project: projectOk ? rawQuery.project : DEFAULT_TASK_QUERY.project,
      tagIds: rawQuery.tagIds.filter((id) => tags.some((t) => t.id === id)),
    };
  }, [rawQuery, projects, tags]);

  const updateQuery = (patch: Partial<TaskQuery>, replace = false) => {
    setParams(toSearchParams({ ...query, ...patch }), { replace });
  };
  const resetFilters = () => {
    setParams(toSearchParams({ ...DEFAULT_TASK_QUERY, sort: query.sort }));
  };

  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const tagById = useMemo(() => new Map((tags ?? []).map((t) => [t.id, t])), [tags]);

  const visible = useMemo(
    () => (tasks ? queryTasks(tasks, query, { today, weekStartsOn: settings.weekStartsOn }) : []),
    [tasks, query, today, settings.weekStartsOn],
  );

  if (!tasks || !projects || !tags) return null;

  const filtered = hasActiveFilters(query);
  const editingTask = editingId === null ? undefined : tasks.find((t) => t.id === editingId);

  const reportError = (error: unknown, fallback: string) => {
    toast.show({ message: error instanceof ValidationError ? error.message : fallback });
  };

  const addTask = async (title: string) => {
    try {
      await createTask({
        title,
        projectId: query.project !== 'all' && query.project !== 'none' ? query.project : null,
      });
    } catch (error) {
      reportError(error, '할 일을 저장하지 못했어요.');
      throw error;
    }
  };

  const toggle = (id: string, done: boolean) => {
    setTaskDone(id, done).catch((error: unknown) => reportError(error, '저장하지 못했어요.'));
  };

  const clearDone = async () => {
    setConfirmingClear(false);
    try {
      const count = await deleteDoneTasks();
      toast.show({ message: `완료한 할 일 ${count}개를 삭제했어요.` });
    } catch (error) {
      reportError(error, '삭제하지 못했어요.');
    }
  };

  return (
    <>
      <PageHeader title="할 일" />
      <QuickAdd inputRef={quickAddRef} onAdd={addTask} />
      <FilterBar
        query={query}
        projects={projects}
        tags={tags}
        searchRef={searchRef}
        showReset={filtered}
        onChange={updateQuery}
        onReset={resetFilters}
        onManage={() => setManaging(true)}
      />

      {query.status === 'done' && doneCount > 0 && (
        <div className={styles.clearRow}>
          <Button variant="danger" size="sm" onClick={() => setConfirmingClear(true)}>
            완료한 할 일 모두 삭제
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        tasks.length === 0 ? (
          <EmptyState
            title="아직 할 일이 없어요"
            description="위 입력창에 적고 Enter를 누르면 추가돼요."
            action={
              <Button variant="primary" onClick={() => quickAddRef.current?.focus()}>
                첫 할 일 만들기
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={filtered ? '조건에 맞는 할 일이 없어요' : '이 목록에는 할 일이 없어요'}
            description={
              filtered
                ? '필터나 검색어를 바꿔 보세요.'
                : query.status === 'done'
                  ? '완료한 할 일이 여기에 모여요.'
                  : '모두 끝냈어요. 새 할 일을 추가해 보세요.'
            }
            action={filtered ? <Button onClick={resetFilters}>필터 초기화</Button> : undefined}
          />
        )
      ) : (
        <ul className={styles.list} aria-label="할 일 목록">
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              project={task.projectId === null ? undefined : projectById.get(task.projectId)}
              tags={task.tagIds.flatMap((id) => tagById.get(id) ?? [])}
              today={today}
              focusMs={focusTotals?.get(task.id)}
              onToggle={(done) => toggle(task.id, done)}
              onOpen={() => setEditingId(task.id)}
              onStartFocus={() =>
                void startFocus({ type: 'task', id: task.id, titleSnapshot: task.title })
              }
            />
          ))}
        </ul>
      )}

      {editingTask && (
        <TaskEditPanel
          key={editingTask.id}
          task={editingTask}
          projects={projects}
          tags={tags}
          onClose={() => setEditingId(null)}
          onStartFocus={() => {
            setEditingId(null);
            void startFocus({
              type: 'task',
              id: editingTask.id,
              titleSnapshot: editingTask.title,
            });
          }}
        />
      )}
      {managing && (
        <ManageDialog projects={projects} tags={tags} onClose={() => setManaging(false)} />
      )}
      {confirmingClear && (
        <ConfirmDialog
          title="완료한 할 일을 모두 삭제할까요?"
          message={`완료한 할 일 ${doneCount}개를 삭제해요. 되돌릴 수 없어요.`}
          confirmLabel={`${doneCount}개 삭제`}
          danger
          onCancel={() => setConfirmingClear(false)}
          onConfirm={() => void clearDone()}
        />
      )}
    </>
  );
}
