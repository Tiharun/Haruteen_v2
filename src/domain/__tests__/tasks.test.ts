import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_QUERY,
  filterTasks,
  groupTodayTasks,
  todayTaskCounts,
  hasActiveFilters,
  isOverdue,
  matchesSearch,
  parseTaskQuery,
  queryTasks,
  sortTasks,
  toSearchParams,
  type TaskQuery,
} from '../tasks';
import type { LocalDate, Task } from '../types';

const d = (s: string) => s as LocalDate;
// 2026-10-03은 토요일. 주 시작이 월요일이면 이번 주는 09-28 ~ 10-04.
const ctx = { today: d('2026-10-03'), weekStartsOn: 1 as const };

let seq = 0;
function task(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `할 일 ${seq}`,
    note: '',
    priority: 'medium',
    dueDate: null,
    projectId: null,
    tagIds: [],
    subtasks: [],
    status: 'todo',
    completedAt: null,
    createdAt: seq,
    updatedAt: seq,
    ...over,
  };
}
const q = (over: Partial<TaskQuery> = {}): TaskQuery => ({ ...DEFAULT_TASK_QUERY, ...over });
const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe('isOverdue', () => {
  it('진행 중이고 마감일이 어제 이전이면 지남', () => {
    expect(isOverdue(task({ dueDate: d('2026-10-02') }), ctx.today)).toBe(true);
  });
  it('오늘 마감·마감 없음은 지남이 아니다', () => {
    expect(isOverdue(task({ dueDate: d('2026-10-03') }), ctx.today)).toBe(false);
    expect(isOverdue(task(), ctx.today)).toBe(false);
  });
  it('완료한 할 일은 지남이 아니다', () => {
    expect(isOverdue(task({ dueDate: d('2026-10-01'), status: 'done' }), ctx.today)).toBe(false);
  });
});

describe('필터', () => {
  const todo = task({ id: 'todo' });
  const done = task({ id: 'done', status: 'done', completedAt: 1 });

  it('상태: 기본은 진행 중, done, all', () => {
    const all = [todo, done];
    expect(ids(filterTasks(all, q(), ctx))).toEqual(['todo']);
    expect(ids(filterTasks(all, q({ status: 'done' }), ctx))).toEqual(['done']);
    expect(ids(filterTasks(all, q({ status: 'all' }), ctx))).toEqual(['todo', 'done']);
  });

  it('프로젝트: 특정·없음·전체', () => {
    const a = task({ id: 'a', projectId: 'p1' });
    const b = task({ id: 'b', projectId: 'p2' });
    const c = task({ id: 'c' });
    const all = [a, b, c];
    expect(ids(filterTasks(all, q({ project: 'p1' }), ctx))).toEqual(['a']);
    expect(ids(filterTasks(all, q({ project: 'none' }), ctx))).toEqual(['c']);
    expect(ids(filterTasks(all, q({ project: 'all' }), ctx))).toEqual(['a', 'b', 'c']);
  });

  it('태그를 여러 개 고르면 모두 가진 할 일만 남는다', () => {
    const both = task({ id: 'both', tagIds: ['x', 'y', 'z'] });
    const onlyX = task({ id: 'onlyX', tagIds: ['x'] });
    const none = task({ id: 'none' });
    const all = [both, onlyX, none];
    expect(ids(filterTasks(all, q({ tagIds: ['x', 'y'] }), ctx))).toEqual(['both']);
    expect(ids(filterTasks(all, q({ tagIds: ['x'] }), ctx))).toEqual(['both', 'onlyX']);
    expect(ids(filterTasks(all, q({ tagIds: [] }), ctx))).toEqual(['both', 'onlyX', 'none']);
  });

  it('마감: 지남은 어제 이전 마감 할 일에만, 오늘·이번 주·없음', () => {
    const yesterday = task({ id: 'yesterday', dueDate: d('2026-10-02') });
    const today = task({ id: 'today', dueDate: d('2026-10-03') });
    const sunday = task({ id: 'sunday', dueDate: d('2026-10-04') });
    const nextWeek = task({ id: 'nextWeek', dueDate: d('2026-10-05') });
    const monday = task({ id: 'monday', dueDate: d('2026-09-28') });
    const lastWeek = task({ id: 'lastWeek', dueDate: d('2026-09-27') });
    const none = task({ id: 'none' });
    const all = [yesterday, today, sunday, nextWeek, monday, lastWeek, none];

    expect(ids(filterTasks(all, q({ due: 'overdue' }), ctx))).toEqual([
      'yesterday',
      'monday',
      'lastWeek',
    ]);
    expect(ids(filterTasks(all, q({ due: 'today' }), ctx))).toEqual(['today']);
    expect(ids(filterTasks(all, q({ due: 'week' }), ctx))).toEqual([
      'yesterday',
      'today',
      'sunday',
      'monday',
    ]);
    expect(ids(filterTasks(all, q({ due: 'none' }), ctx))).toEqual(['none']);
  });

  it('주 시작이 일요일이면 이번 주 범위가 달라진다', () => {
    const sunday = task({ id: 'sunday', dueDate: d('2026-09-27') });
    const sundayCtx = { today: ctx.today, weekStartsOn: 7 as const };
    expect(ids(filterTasks([sunday], q({ due: 'week' }), sundayCtx))).toEqual(['sunday']);
    expect(ids(filterTasks([sunday], q({ due: 'week' }), ctx))).toEqual([]);
  });
});

describe('검색', () => {
  it('제목·메모·하위 할 일 제목에서 대소문자 무시 부분 일치', () => {
    const inTitle = task({ title: 'Buy MILK' });
    const inNote = task({ note: 'remember the milk' });
    const inSub = task({ subtasks: [{ id: 's', title: 'Oat Milk', done: false }] });
    const miss = task({ title: '운동' });
    expect(matchesSearch(inTitle, 'milk')).toBe(true);
    expect(matchesSearch(inNote, 'MILK')).toBe(true);
    expect(matchesSearch(inSub, 'oat')).toBe(true);
    expect(matchesSearch(miss, 'milk')).toBe(false);
  });

  it('빈 검색어·공백 검색어는 모두 일치', () => {
    expect(matchesSearch(task(), '')).toBe(true);
    expect(matchesSearch(task(), '   ')).toBe(true);
  });

  it('검색은 필터와 함께 적용된다', () => {
    const a = task({ id: 'a', title: '장보기' });
    const b = task({ id: 'b', title: '장보기', status: 'done' });
    expect(ids(filterTasks([a, b], q({ q: '장' }), ctx))).toEqual(['a']);
  });
});

describe('정렬', () => {
  it('마감일: 오름차순, 마감 없음은 마지막', () => {
    const none = task({ id: 'none' });
    const late = task({ id: 'late', dueDate: d('2026-11-01') });
    const soon = task({ id: 'soon', dueDate: d('2026-10-05') });
    expect(ids(sortTasks([none, late, soon], 'due'))).toEqual(['soon', 'late', 'none']);
  });

  it('우선순위: 높음→낮음, 같으면 마감일', () => {
    const lowSoon = task({ id: 'lowSoon', priority: 'low', dueDate: d('2026-10-04') });
    const highLate = task({ id: 'highLate', priority: 'high', dueDate: d('2026-12-01') });
    const highSoon = task({ id: 'highSoon', priority: 'high', dueDate: d('2026-10-05') });
    const mid = task({ id: 'mid', priority: 'medium' });
    expect(ids(sortTasks([lowSoon, highLate, mid, highSoon], 'priority'))).toEqual([
      'highSoon',
      'highLate',
      'mid',
      'lowSoon',
    ]);
  });

  it('최근 생성: 나중에 만든 것이 먼저', () => {
    const first = task({ id: 'first', createdAt: 1 });
    const second = task({ id: 'second', createdAt: 2 });
    expect(ids(sortTasks([first, second], 'created'))).toEqual(['second', 'first']);
  });

  it('이름: 가나다순', () => {
    const c = task({ id: 'c', title: '다' });
    const a = task({ id: 'a', title: '가' });
    const b = task({ id: 'b', title: '나' });
    expect(ids(sortTasks([c, a, b], 'name'))).toEqual(['a', 'b', 'c']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const list = [task({ id: 'x', title: '나' }), task({ id: 'y', title: '가' })];
    sortTasks(list, 'name');
    expect(ids(list)).toEqual(['x', 'y']);
  });

  it('queryTasks는 필터 뒤에 정렬한다', () => {
    const a = task({ id: 'a', title: '나' });
    const b = task({ id: 'b', title: '가' });
    const done = task({ id: 'done', title: '다', status: 'done' });
    expect(ids(queryTasks([a, b, done], q({ sort: 'name' }), ctx))).toEqual(['b', 'a']);
  });
});

describe('URL 쿼리', () => {
  it('기본값은 주소에 넣지 않는다', () => {
    expect(toSearchParams(DEFAULT_TASK_QUERY).toString()).toBe('');
  });

  it('쓰고 다시 읽으면 같은 값이 된다', () => {
    const query = q({
      status: 'all',
      project: 'p1',
      tagIds: ['t1', 't2'],
      due: 'overdue',
      sort: 'priority',
      q: '우유 사기',
    });
    expect(parseTaskQuery(toSearchParams(query))).toEqual(query);
  });

  it('알 수 없는 값은 기본값으로 되돌린다', () => {
    const parsed = parseTaskQuery(new URLSearchParams('status=zzz&due=nope&sort=x&tags=a,,a,b'));
    expect(parsed.status).toBe('todo');
    expect(parsed.due).toBe('all');
    expect(parsed.sort).toBe('due');
    expect(parsed.tagIds).toEqual(['a', 'b']);
  });

  it('hasActiveFilters: 정렬만 바꾼 건 필터가 아니다', () => {
    expect(hasActiveFilters(DEFAULT_TASK_QUERY)).toBe(false);
    expect(hasActiveFilters(q({ sort: 'name' }))).toBe(false);
    expect(hasActiveFilters(q({ q: 'a' }))).toBe(true);
    expect(hasActiveFilters(q({ tagIds: ['x'] }))).toBe(true);
  });
});

describe('groupTodayTasks', () => {
  const today = d('2026-10-03');
  const at = (text: string, hour = 12) =>
    new Date(`${text}T${String(hour).padStart(2, '0')}:00:00+09:00`).getTime();

  it('어제 마감·오늘 마감·마감 없음이 각각 맞는 그룹에 들어간다', () => {
    const yesterday = task({ dueDate: d('2026-10-02') });
    const dueToday = task({ dueDate: today });
    const noDue = task();
    const tomorrow = task({ dueDate: d('2026-10-04') });
    const groups = groupTodayTasks([yesterday, dueToday, noDue, tomorrow], today, 0);
    expect(groups.overdue).toEqual([yesterday]);
    expect(groups.due).toEqual([dueToday]);
    expect(groups.noDue).toEqual([noDue]);
    expect(groups.doneToday).toEqual([]);
  });

  it('그룹 안에서는 우선순위 → 생성순(오래된 것 먼저)', () => {
    const low = task({ dueDate: today, priority: 'low', createdAt: 1 });
    const highNew = task({ dueDate: today, priority: 'high', createdAt: 3 });
    const highOld = task({ dueDate: today, priority: 'high', createdAt: 2 });
    const groups = groupTodayTasks([low, highNew, highOld], today, 0);
    expect(groups.due).toEqual([highOld, highNew, low]);
  });

  it('완료한 할 일은 오늘 완료한 것만 doneToday에 들어간다 (하루 시작 시각 반영)', () => {
    const doneToday = task({ status: 'done', completedAt: at('2026-10-03') });
    const doneYesterday = task({ status: 'done', completedAt: at('2026-10-02') });
    const tasks = [doneToday, doneYesterday];
    expect(groupTodayTasks(tasks, today, 0).doneToday).toEqual([doneToday]);

    // 하루 시작 4시: 10/3 새벽 2시에 완료한 것은 10/2 소속
    const early = task({ status: 'done', completedAt: at('2026-10-03', 2) });
    expect(groupTodayTasks([early], today, 4).doneToday).toEqual([]);
    expect(groupTodayTasks([early], d('2026-10-02'), 4).doneToday).toEqual([early]);
  });

  it('완료한 할 일은 지난·오늘 마감·마감 없음 그룹에 중복으로 들어가지 않는다', () => {
    const done = task({ status: 'done', completedAt: at('2026-10-03'), dueDate: today });
    const groups = groupTodayTasks([done], today, 0);
    expect(groups.due).toEqual([]);
    expect(groups.overdue).toEqual([]);
    expect(groups.noDue).toEqual([]);
  });
});

describe('todayTaskCounts', () => {
  const today = d('2026-10-03');
  const doneAt = new Date('2026-10-03T12:00:00+09:00').getTime();

  it('분모는 지난·오늘 마감 할 일이고, 끝낸 것도 빠지지 않는다', () => {
    const overdue = task({ dueDate: d('2026-10-01') });
    const dueToday = task({ dueDate: today });
    const overdueDone = task({ dueDate: d('2026-10-01'), status: 'done', completedAt: doneAt });
    const dueTodayDone = task({ dueDate: today, status: 'done', completedAt: doneAt });
    const groups = groupTodayTasks([overdue, dueToday, overdueDone, dueTodayDone], today, 0);
    expect(todayTaskCounts(groups, today)).toEqual({ done: 2, total: 4 });
  });

  it('마감 없음·미래 마감은 분모에 넣지 않는다', () => {
    const noDue = task();
    const noDueDone = task({ status: 'done', completedAt: doneAt });
    const futureDone = task({ dueDate: d('2026-10-09'), status: 'done', completedAt: doneAt });
    const groups = groupTodayTasks([noDue, noDueDone, futureDone], today, 0);
    expect(todayTaskCounts(groups, today)).toEqual({ done: 2, total: 0 });
  });
});
