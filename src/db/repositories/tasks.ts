import { useLiveQuery } from 'dexie-react-hooks';
import type { ID, LocalDate, Priority, Subtask, Task } from '../../domain/types';
import {
  unwrap,
  validateSubtaskCount,
  validateSubtaskTitle,
  validateTaskNote,
  validateTaskTagCount,
  validateTaskTitle,
} from '../../domain/validation';
import { db } from '../db';

export interface NewTaskInput {
  title: string;
  projectId?: ID | null;
  dueDate?: LocalDate | null;
  priority?: Priority;
}

/** 입력값은 저장 전에 검증한다. 실패하면 ValidationError를 던진다. */
export async function createTask(input: NewTaskInput, now: number = Date.now()): Promise<Task> {
  const task: Task = {
    id: crypto.randomUUID(),
    title: unwrap(validateTaskTitle(input.title)),
    note: '',
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    projectId: input.projectId ?? null,
    tagIds: [],
    subtasks: [],
    status: 'todo',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.tasks.add(task);
  return task;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'note' | 'priority' | 'dueDate' | 'projectId' | 'tagIds'>
>;

function validatePatch(patch: TaskPatch): TaskPatch {
  const next: TaskPatch = { ...patch };
  if (patch.title !== undefined) next.title = unwrap(validateTaskTitle(patch.title));
  if (patch.note !== undefined) next.note = unwrap(validateTaskNote(patch.note));
  if (patch.tagIds !== undefined) {
    const unique = Array.from(new Set(patch.tagIds));
    unwrap(validateTaskTagCount(unique.length));
    next.tagIds = unique;
  }
  return next;
}

/** 일부 항목만 바꾼다. 이미 삭제된 할 일이면 아무것도 하지 않고 null. */
export async function updateTask(
  id: ID,
  patch: TaskPatch,
  now: number = Date.now(),
): Promise<Task | null> {
  const valid = validatePatch(patch);
  return db.transaction('rw', db.tasks, async () => {
    const current = await db.tasks.get(id);
    if (!current) return null;
    const next: Task = { ...current, ...valid, updatedAt: now };
    await db.tasks.put(next);
    return next;
  });
}

/**
 * 태그를 하나 붙이거나 뗀다. 저장된 최신 태그 목록을 트랜잭션 안에서 읽고 바꾸므로,
 * 화면 값이 아직 갱신되기 전에 연달아 눌러도 앞선 선택이 사라지지 않는다.
 */
export async function toggleTaskTag(
  id: ID,
  tagId: ID,
  now: number = Date.now(),
): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const current = await db.tasks.get(id);
    if (!current) return null;
    const tagIds = current.tagIds.includes(tagId)
      ? current.tagIds.filter((t) => t !== tagId)
      : [...current.tagIds, tagId];
    unwrap(validateTaskTagCount(tagIds.length));
    const next: Task = { ...current, tagIds, updatedAt: now };
    await db.tasks.put(next);
    return next;
  });
}

/** 완료하면 completedAt=now, 되돌리면 null. 하위 할 일 상태와는 무관하다. */
export async function setTaskDone(
  id: ID,
  done: boolean,
  now: number = Date.now(),
): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const current = await db.tasks.get(id);
    if (!current) return null;
    const next: Task = {
      ...current,
      status: done ? 'done' : 'todo',
      completedAt: done ? now : null,
      updatedAt: now,
    };
    await db.tasks.put(next);
    return next;
  });
}

export async function deleteTask(id: ID): Promise<void> {
  await db.tasks.delete(id);
}

export function countDoneTasks(): Promise<number> {
  return db.tasks.where('status').equals('done').count();
}

/** 완료한 할 일을 모두 지우고 지운 개수를 돌려준다. */
export async function deleteDoneTasks(): Promise<number> {
  return db.transaction('rw', db.tasks, async () => {
    const count = await db.tasks.where('status').equals('done').count();
    await db.tasks.where('status').equals('done').delete();
    return count;
  });
}

// ---- 하위 할 일: 항상 DB의 최신 목록을 읽어 한 항목만 바꾼다 ----

async function mutateSubtasks(
  taskId: ID,
  now: number,
  change: (subtasks: Subtask[]) => Subtask[],
): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const current = await db.tasks.get(taskId);
    if (!current) return null;
    const next: Task = { ...current, subtasks: change(current.subtasks), updatedAt: now };
    await db.tasks.put(next);
    return next;
  });
}

export async function addSubtask(taskId: ID, title: string, now: number = Date.now()) {
  const valid = unwrap(validateSubtaskTitle(title));
  return mutateSubtasks(taskId, now, (subtasks) => {
    unwrap(validateSubtaskCount(subtasks.length + 1));
    return [...subtasks, { id: crypto.randomUUID(), title: valid, done: false }];
  });
}

export async function updateSubtask(
  taskId: ID,
  subtaskId: ID,
  patch: Partial<Pick<Subtask, 'title' | 'done'>>,
  now: number = Date.now(),
) {
  const next = { ...patch };
  if (patch.title !== undefined) next.title = unwrap(validateSubtaskTitle(patch.title));
  return mutateSubtasks(taskId, now, (subtasks) =>
    subtasks.map((s) => (s.id === subtaskId ? { ...s, ...next } : s)),
  );
}

export function removeSubtask(taskId: ID, subtaskId: ID, now: number = Date.now()) {
  return mutateSubtasks(taskId, now, (subtasks) => subtasks.filter((s) => s.id !== subtaskId));
}

// ---- 구독 ----

/** 모든 할 일. 첫 조회가 끝나기 전에는 undefined. */
export function useTasksQuery(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.toArray(), []);
}

/** 한 할 일. 첫 조회 전에는 undefined, 없으면 null. */
export function useTaskQuery(id: ID): Task | null | undefined {
  return useLiveQuery(async () => (await db.tasks.get(id)) ?? null, [id]);
}

export function useDoneTaskCount(): number {
  return useLiveQuery(countDoneTasks, []) ?? 0;
}
