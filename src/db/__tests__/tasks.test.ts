import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../../domain/validation';
import { db } from '../db';
import { createProject, deleteProject, updateProject } from '../repositories/projects';
import { createTag, deleteTag, updateTag } from '../repositories/tags';
import {
  addSubtask,
  createTask,
  deleteDoneTasks,
  deleteTask,
  removeSubtask,
  setTaskDone,
  toggleTaskTag,
  updateSubtask,
  updateTask,
} from '../repositories/tasks';

beforeEach(async () => {
  await db.open();
  await Promise.all([db.tasks.clear(), db.projects.clear(), db.tags.clear()]);
});

describe('tasks repository', () => {
  it('태그를 연달아 토글해도 앞선 선택이 사라지지 않는다', async () => {
    const task = await createTask({ title: '할 일' });
    const [a, b] = await Promise.all([createTag('a', 'red'), createTag('b', 'blue')]);
    await Promise.all([toggleTaskTag(task.id, a.id), toggleTaskTag(task.id, b.id)]);
    expect((await db.tasks.get(task.id))?.tagIds.sort()).toEqual([a.id, b.id].sort());

    await toggleTaskTag(task.id, a.id);
    expect((await db.tasks.get(task.id))?.tagIds).toEqual([b.id]);
    expect(await toggleTaskTag('없는-id', a.id)).toBeNull();
  });

  it('만들기 → 수정 → 완료 → 완료 취소 → 삭제', async () => {
    const task = await createTask({ title: '  장보기  ' }, 1000);
    expect(task).toMatchObject({
      title: '장보기',
      priority: 'medium',
      status: 'todo',
      dueDate: null,
      createdAt: 1000,
    });

    const edited = await updateTask(task.id, { title: '장보기!', priority: 'high' }, 2000);
    expect(edited).toMatchObject({ title: '장보기!', priority: 'high', updatedAt: 2000 });

    const done = await setTaskDone(task.id, true, 3000);
    expect(done).toMatchObject({ status: 'done', completedAt: 3000 });

    const undone = await setTaskDone(task.id, false, 4000);
    expect(undone).toMatchObject({ status: 'todo', completedAt: null });

    await deleteTask(task.id);
    expect(await db.tasks.count()).toBe(0);
  });

  it('공백뿐인 제목은 저장하지 않는다', async () => {
    await expect(createTask({ title: '   ' })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.tasks.count()).toBe(0);

    const task = await createTask({ title: '원래 제목' });
    await expect(updateTask(task.id, { title: '' })).rejects.toBeInstanceOf(ValidationError);
    expect((await db.tasks.get(task.id))?.title).toBe('원래 제목');
  });

  it('이미 삭제된 할 일을 수정하면 아무 일도 없다', async () => {
    const task = await createTask({ title: 'a' });
    await deleteTask(task.id);
    expect(await updateTask(task.id, { title: 'b' })).toBeNull();
    expect(await db.tasks.count()).toBe(0);
  });

  it('하위 할 일을 모두 체크해도 자동 완료하지 않고, 남아 있어도 완료할 수 있다', async () => {
    const task = await createTask({ title: 'a' });
    const withSub = await addSubtask(task.id, '하나');
    const sub = withSub?.subtasks[0];
    if (!sub) throw new Error('하위 할 일이 만들어지지 않았어요');

    await updateSubtask(task.id, sub.id, { done: true });
    expect((await db.tasks.get(task.id))?.status).toBe('todo');

    await updateSubtask(task.id, sub.id, { done: false });
    await setTaskDone(task.id, true);
    expect((await db.tasks.get(task.id))?.status).toBe('done');
  });

  it('하위 할 일 이름 변경·삭제는 다른 하위 항목을 건드리지 않는다', async () => {
    const task = await createTask({ title: 'a' });
    await addSubtask(task.id, '가');
    const second = await addSubtask(task.id, '나');
    const [first, other] = second?.subtasks ?? [];
    if (!first || !other) throw new Error('하위 할 일이 만들어지지 않았어요');

    await updateSubtask(task.id, first.id, { title: ' 가가 ' });
    await removeSubtask(task.id, other.id);
    expect((await db.tasks.get(task.id))?.subtasks.map((s) => s.title)).toEqual(['가가']);
    await expect(addSubtask(task.id, '  ')).rejects.toBeInstanceOf(ValidationError);
  });

  it('하위 할 일은 50개까지', async () => {
    const task = await createTask({ title: 'a' });
    for (let i = 0; i < 50; i++) await addSubtask(task.id, `s${i}`);
    await expect(addSubtask(task.id, '51번째')).rejects.toBeInstanceOf(ValidationError);
    expect((await db.tasks.get(task.id))?.subtasks).toHaveLength(50);
  });

  it('태그는 10개까지, 중복은 합친다', async () => {
    const task = await createTask({ title: 'a' });
    const eleven = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    await expect(updateTask(task.id, { tagIds: eleven })).rejects.toBeInstanceOf(ValidationError);
    const saved = await updateTask(task.id, { tagIds: ['x', 'x', 'y'] });
    expect(saved?.tagIds).toEqual(['x', 'y']);
  });

  it('완료한 할 일 모두 삭제는 개수를 돌려주고 진행 중인 것은 남긴다', async () => {
    const a = await createTask({ title: 'a' });
    const b = await createTask({ title: 'b' });
    await createTask({ title: 'c' });
    await setTaskDone(a.id, true);
    await setTaskDone(b.id, true);
    expect(await deleteDoneTasks()).toBe(2);
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['c']);
  });
});

describe('projects repository', () => {
  it('대소문자만 다른 이름은 중복으로 거절한다', async () => {
    await createProject('Work', 'blue');
    await expect(createProject('work', 'red')).rejects.toBeInstanceOf(ValidationError);
    const other = await createProject('Home', 'green');
    await expect(updateProject(other.id, { name: 'WORK' })).rejects.toBeInstanceOf(ValidationError);
    // 자기 이름은 대소문자만 바꿔 저장할 수 있다
    expect((await updateProject(other.id, { name: 'HOME' }))?.name).toBe('HOME');
  });

  it('프로젝트는 50개까지', async () => {
    for (let i = 0; i < 50; i++) await createProject(`p${i}`, 'gray');
    await expect(createProject('p50', 'gray')).rejects.toBeInstanceOf(ValidationError);
  });

  it('삭제하면 그 프로젝트의 할 일만 프로젝트 없음이 된다', async () => {
    const keep = await createProject('남길 것', 'blue');
    const drop = await createProject('지울 것', 'red');
    const inDrop = await createTask({ title: 'x', projectId: drop.id });
    const inKeep = await createTask({ title: 'y', projectId: keep.id });

    await deleteProject(drop.id, 9000);

    expect(await db.projects.get(drop.id)).toBeUndefined();
    expect(await db.tasks.get(inDrop.id)).toMatchObject({ projectId: null, updatedAt: 9000 });
    expect((await db.tasks.get(inKeep.id))?.projectId).toBe(keep.id);
  });
});

describe('tags repository', () => {
  it('대소문자만 다른 이름은 중복으로 거절한다', async () => {
    await createTag('Urgent', 'red');
    await expect(createTag('urgent', 'red')).rejects.toBeInstanceOf(ValidationError);
    const tag = await createTag('Later', 'gray');
    expect((await updateTag(tag.id, { color: 'blue' }))?.color).toBe('blue');
  });

  it('삭제하면 모든 할 일의 tagIds에서 빠지고 다른 태그는 남는다', async () => {
    const x = await createTag('x', 'red');
    const y = await createTag('y', 'blue');
    const a = await createTask({ title: 'a' });
    const b = await createTask({ title: 'b' });
    const c = await createTask({ title: 'c' });
    await updateTask(a.id, { tagIds: [x.id, y.id] });
    await updateTask(b.id, { tagIds: [x.id] });
    await updateTask(c.id, { tagIds: [y.id] });

    await deleteTag(x.id);

    expect(await db.tags.get(x.id)).toBeUndefined();
    expect((await db.tasks.get(a.id))?.tagIds).toEqual([y.id]);
    expect((await db.tasks.get(b.id))?.tagIds).toEqual([]);
    expect((await db.tasks.get(c.id))?.tagIds).toEqual([y.id]);
  });
});
