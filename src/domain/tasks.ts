// DESIGN.md §4.2 할 일 규칙. 순수 함수만 둔다(현재 시각은 today 인자로 받는다).
import { compareDates, parseLocalDate, todayOf, weekRange } from './dates';
import type { ID, LocalDate, Priority, Task } from './types';

export type StatusFilter = 'todo' | 'done' | 'all';
/** 'all' = 전체, 'none' = 프로젝트 없음, 그 외 = 프로젝트 id */
export type ProjectFilter = 'all' | 'none' | ID;
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';
export type TaskSort = 'due' | 'priority' | 'created' | 'name';

export interface TaskQuery {
  status: StatusFilter;
  project: ProjectFilter;
  /** 여러 개면 모두 가진 할 일만 */
  tagIds: ID[];
  due: DueFilter;
  sort: TaskSort;
  q: string;
}

export const DEFAULT_TASK_QUERY: TaskQuery = {
  status: 'todo',
  project: 'all',
  tagIds: [],
  due: 'all',
  sort: 'due',
  q: '',
};

export interface TaskDateContext {
  today: LocalDate;
  weekStartsOn: 1 | 7;
}

/** 지난 할 일 = 진행 중이고 마감일이 오늘보다 앞. */
export function isOverdue(task: Task, today: LocalDate): boolean {
  return task.status === 'todo' && task.dueDate !== null && compareDates(task.dueDate, today) < 0;
}

/** 제목·메모·하위 할 일 제목에서 대소문자 무시 부분 일치. 빈 검색어는 모두 일치. */
export function matchesSearch(task: Task, q: string): boolean {
  const needle = q.trim().normalize('NFC').toLowerCase();
  if (needle === '') return true;
  const has = (text: string) => text.toLowerCase().includes(needle);
  return has(task.title) || has(task.note) || task.subtasks.some((s) => has(s.title));
}

function matchesDue(task: Task, due: DueFilter, ctx: TaskDateContext): boolean {
  switch (due) {
    case 'all':
      return true;
    case 'none':
      return task.dueDate === null;
    case 'overdue':
      return isOverdue(task, ctx.today);
    case 'today':
      return task.dueDate === ctx.today;
    case 'week': {
      if (task.dueDate === null) return false;
      const { from, to } = weekRange(ctx.today, ctx.weekStartsOn);
      return compareDates(task.dueDate, from) >= 0 && compareDates(task.dueDate, to) <= 0;
    }
  }
}

export function filterTasks(
  tasks: readonly Task[],
  query: TaskQuery,
  ctx: TaskDateContext,
): Task[] {
  return tasks.filter((task) => {
    if (query.status !== 'all' && task.status !== query.status) return false;
    if (query.project === 'none' && task.projectId !== null) return false;
    if (query.project !== 'all' && query.project !== 'none' && task.projectId !== query.project) {
      return false;
    }
    if (!query.tagIds.every((id) => task.tagIds.includes(id))) return false;
    if (!matchesDue(task, query.due, ctx)) return false;
    return matchesSearch(task, query.q);
  });
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** 마감일 오름차순, 마감 없음은 마지막. */
function compareDue(a: Task, b: Task): number {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return compareDates(a.dueDate, b.dueDate);
}

const byCreatedDesc = (a: Task, b: Task) => b.createdAt - a.createdAt;

const COMPARATORS: Record<TaskSort, (a: Task, b: Task) => number> = {
  due: (a, b) => compareDue(a, b) || byCreatedDesc(a, b),
  priority: (a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    compareDue(a, b) ||
    byCreatedDesc(a, b),
  created: byCreatedDesc,
  name: (a, b) => a.title.localeCompare(b.title, 'ko') || byCreatedDesc(a, b),
};

/** 원본을 바꾸지 않고 정렬한 새 배열을 돌려준다. */
export function sortTasks(tasks: readonly Task[], sort: TaskSort): Task[] {
  return [...tasks].sort(COMPARATORS[sort]);
}

export function queryTasks(tasks: readonly Task[], query: TaskQuery, ctx: TaskDateContext): Task[] {
  return sortTasks(filterTasks(tasks, query, ctx), query.sort);
}

/** 검색어를 뺀 필터(상태·프로젝트·태그·마감·검색)가 기본값과 다른지. 정렬은 포함하지 않는다. */
export function hasActiveFilters(query: TaskQuery): boolean {
  return (
    query.status !== DEFAULT_TASK_QUERY.status ||
    query.project !== DEFAULT_TASK_QUERY.project ||
    query.tagIds.length > 0 ||
    query.due !== DEFAULT_TASK_QUERY.due ||
    query.q !== ''
  );
}

// ---- 오늘 화면 ----

export interface TodayTaskGroups {
  /** 지난 할 일 */
  overdue: Task[];
  /** 오늘 마감 */
  due: Task[];
  /** 마감 없음 */
  noDue: Task[];
  /** 오늘 완료한 할 일 */
  doneToday: Task[];
}

/** 같은 그룹 안에서는 우선순위 → 생성순(오래된 것 먼저). */
function byPriorityThenCreated(a: Task, b: Task): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt;
}

/** 오늘 화면의 할 일 그룹. 마감이 내일 이후인 진행 중 할 일은 어느 그룹에도 들어가지 않는다. */
export function groupTodayTasks(
  tasks: readonly Task[],
  today: LocalDate,
  dayStartHour: number,
): TodayTaskGroups {
  const pick = (test: (task: Task) => boolean) => tasks.filter(test).sort(byPriorityThenCreated);
  return {
    overdue: pick((t) => isOverdue(t, today)),
    due: pick((t) => t.status === 'todo' && t.dueDate === today),
    noDue: pick((t) => t.status === 'todo' && t.dueDate === null),
    doneToday: pick(
      (t) =>
        t.status === 'done' &&
        t.completedAt !== null &&
        todayOf(t.completedAt, dayStartHour) === today,
    ),
  };
}

/**
 * 요약 카드의 할 일 수 (§5.2): 분자 = 오늘 완료한 수, 분모 = 오늘 마감+지난 할 일 수.
 * 지난·오늘 마감 할 일을 오늘 끝내도 분모가 줄지 않도록, 마감이 오늘 이전인데 오늘 완료한 것도 분모에 넣는다.
 * 마감 없음·미래 마감 할 일을 완료하면 분자만 늘어난다.
 */
export function todayTaskCounts(
  groups: TodayTaskGroups,
  today: LocalDate,
): { done: number; total: number } {
  const doneWithDue = groups.doneToday.filter(
    (t) => t.dueDate !== null && compareDates(t.dueDate, today) <= 0,
  );
  return {
    done: groups.doneToday.length,
    total: groups.overdue.length + groups.due.length + doneWithDue.length,
  };
}

// ---- URL 쿼리스트링 ↔ TaskQuery ----

const STATUSES: readonly StatusFilter[] = ['todo', 'done', 'all'];
const DUES: readonly DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];
const SORTS: readonly TaskSort[] = ['due', 'priority', 'created', 'name'];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

/** 알 수 없는 값은 기본값으로 되돌린다. */
export function parseTaskQuery(params: URLSearchParams): TaskQuery {
  const tags = params.get('tags');
  return {
    status: pick(params.get('status'), STATUSES, DEFAULT_TASK_QUERY.status),
    project: params.get('project') || DEFAULT_TASK_QUERY.project,
    tagIds: tags ? Array.from(new Set(tags.split(',').filter(Boolean))) : [],
    due: pick(params.get('due'), DUES, DEFAULT_TASK_QUERY.due),
    sort: pick(params.get('sort'), SORTS, DEFAULT_TASK_QUERY.sort),
    q: params.get('q') ?? '',
  };
}

/** 기본값과 같은 항목은 주소에 넣지 않는다. */
export function toSearchParams(query: TaskQuery): URLSearchParams {
  const params = new URLSearchParams();
  const d = DEFAULT_TASK_QUERY;
  if (query.status !== d.status) params.set('status', query.status);
  if (query.project !== d.project) params.set('project', query.project);
  if (query.tagIds.length > 0) params.set('tags', query.tagIds.join(','));
  if (query.due !== d.due) params.set('due', query.due);
  if (query.sort !== d.sort) params.set('sort', query.sort);
  if (query.q !== '') params.set('q', query.q);
  return params;
}

/** 마감일 입력값('YYYY-MM-DD' 또는 빈 문자열)을 LocalDate | null로. 잘못된 값은 undefined. */
export function parseDueInput(text: string): LocalDate | null | undefined {
  if (text === '') return null;
  return parseLocalDate(text) ?? undefined;
}
