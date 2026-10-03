import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TIMER_STATE } from '../../domain/timer';
import { db } from '../db';
import {
  getTimerState,
  listSessionsBetween,
  listSessionsByTarget,
  sumFocusByTarget,
  transitionTimer,
} from '../repositories/focus';
import { updateSettings } from '../repositories/kv';
import { createTask, deleteTask } from '../repositories/tasks';

const MIN = 60_000;
const T0 = 1_700_000_000_000;

beforeEach(async () => {
  await db.open();
  await Promise.all([db.kv.clear(), db.focusSessions.clear(), db.tasks.clear()]);
});

describe('transitionTimer', () => {
  it('저장된 상태가 없으면 기본값(revision 0)에서 시작해 처음 쓸 때 만든다', async () => {
    expect(await getTimerState()).toEqual(DEFAULT_TIMER_STATE);
    expect(await db.kv.get('timer')).toBeUndefined();

    const result = await transitionTimer(0, { type: 'start', runId: 'r1' }, T0);
    expect(result).not.toBe(false);
    expect((await db.kv.get('timer')) ?? null).toMatchObject({ status: 'running', revision: 1 });
  });

  it('revision이 기대값과 다르면 아무것도 하지 않고 false를 돌려준다', async () => {
    await transitionTimer(0, { type: 'start', runId: 'r1' }, T0);

    const stale = await transitionTimer(0, { type: 'pause' }, T0 + 1000);
    expect(stale).toBe(false);
    const state = await getTimerState();
    expect(state).toMatchObject({ status: 'running', revision: 1 });

    const fresh = await transitionTimer(1, { type: 'pause' }, T0 + 1000);
    expect(fresh).not.toBe(false);
    expect((await getTimerState()).status).toBe('paused');
  });

  it('현재 상태에서 의미 없는 동작은 false이고 revision이 오르지 않는다', async () => {
    expect(await transitionTimer(0, { type: 'pause' }, T0)).toBe(false);
    expect((await getTimerState()).revision).toBe(0);
  });

  it('집중 완료 전이는 상태 변경과 세션 기록이 함께 일어난다', async () => {
    await transitionTimer(
      0,
      {
        type: 'start',
        runId: 'r1',
        target: { type: 'task', id: 't1', titleSnapshot: '보고서' },
      },
      T0,
    );
    const done = await transitionTimer(
      1,
      { type: 'complete', nextRunId: 'n' },
      T0 + 25 * MIN + 400,
    );
    if (done === false) throw new Error('완료되어야 해요');

    expect(done.state).toMatchObject({ status: 'idle', phase: 'shortBreak', revision: 2 });
    expect(done.events).toHaveLength(1);
    const sessions = await db.focusSessions.toArray();
    expect(sessions).toEqual([
      {
        id: 'r1',
        target: { type: 'task', id: 't1', titleSnapshot: '보고서' },
        targetId: 't1',
        startedAt: T0,
        endedAt: T0 + 25 * MIN,
        plannedMs: 25 * MIN,
        actualMs: 25 * MIN,
        completed: true,
      },
    ]);
  });

  it('두 탭이 동시에 완료를 감지해도 세션은 1개만 기록되고 한쪽만 성공한다', async () => {
    await transitionTimer(0, { type: 'start', runId: 'r1' }, T0);
    const at = T0 + 25 * MIN + 100;

    const results = await Promise.all([
      transitionTimer(1, { type: 'complete', nextRunId: 'a' }, at),
      transitionTimer(1, { type: 'complete', nextRunId: 'b' }, at + 5),
    ]);

    expect(results.filter((r) => r !== false)).toHaveLength(1);
    expect(await db.focusSessions.count()).toBe(1);
    expect((await getTimerState()).completedFocusInSet).toBe(1);
  });

  it('완료와 중단이 동시에 들어와도 세션은 1개만 기록된다', async () => {
    await transitionTimer(0, { type: 'start', runId: 'r1' }, T0);
    const at = T0 + 25 * MIN + 100;
    await Promise.all([
      transitionTimer(1, { type: 'complete', nextRunId: 'a' }, at),
      transitionTimer(1, { type: 'stop' }, at),
    ]);
    expect(await db.focusSessions.count()).toBe(1);
  });

  it('1분 미만 중단은 세션을 만들지 않고, 2분 뒤 중단은 completed=false로 기록한다', async () => {
    await transitionTimer(0, { type: 'start', runId: 'short' }, T0);
    await transitionTimer(1, { type: 'stop' }, T0 + 30_000);
    expect(await db.focusSessions.count()).toBe(0);

    await transitionTimer(2, { type: 'start', runId: 'long' }, T0 + MIN);
    await transitionTimer(3, { type: 'stop' }, T0 + 3 * MIN);
    const sessions = await db.focusSessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: 'long', completed: false, actualMs: 2 * MIN });
  });

  it('시작할 때의 설정값이 고정되고, 바꾼 설정은 다음 단계부터 적용된다', async () => {
    await updateSettings({ focusMinutes: 1 });
    await transitionTimer(0, { type: 'start', runId: 'r1' }, T0);
    await updateSettings({ focusMinutes: 50, shortBreakMinutes: 9 });

    const done = await transitionTimer(1, { type: 'complete', nextRunId: 'n' }, T0 + MIN);
    if (done === false) throw new Error('1분 설정으로 시작했으니 완료되어야 해요');
    expect(done.session?.plannedMs).toBe(MIN);
    expect(done.state.phase).toBe('shortBreak');

    const next = await transitionTimer(2, { type: 'start', runId: 'b1' }, T0 + 2 * MIN);
    if (next === false) throw new Error('시작되어야 해요');
    expect(next.state.plannedMs).toBe(9 * MIN);
  });

  it('autoStartBreak 설정은 저장소에서 읽은 값으로 적용된다', async () => {
    await updateSettings({ focusMinutes: 1, autoStartBreak: true });
    await transitionTimer(0, { type: 'start', runId: 'r1' }, T0);
    const done = await transitionTimer(1, { type: 'complete', nextRunId: 'b1' }, T0 + MIN);
    if (done === false) throw new Error('완료되어야 해요');
    expect(done.state).toMatchObject({ status: 'running', phase: 'shortBreak', runId: 'b1' });
  });

  it('복원: 닫혀 있던 사이 끝난 집중은 예정 시각에 끝난 것으로 기록되고 다음 단계는 대기', async () => {
    await updateSettings({ focusMinutes: 1, autoStartBreak: true });
    await transitionTimer(0, { type: 'start', runId: 'r1' }, T0);

    // 탭을 닫았다가 2분 뒤 다시 연 상황
    const restored = await transitionTimer(
      1,
      { type: 'complete', nextRunId: 'b1', restored: true },
      T0 + 2 * MIN,
    );
    if (restored === false) throw new Error('복원되어야 해요');
    expect(restored.state).toMatchObject({ status: 'idle', phase: 'shortBreak' });
    expect(restored.events[0]).toMatchObject({ restored: true, actualMs: MIN });
    expect((await db.focusSessions.get('r1'))?.endedAt).toBe(T0 + MIN);
  });
});

describe('세션 조회', () => {
  async function record(runId: string, at: number, targetId: string | null) {
    const target = targetId
      ? ({ type: 'task', id: targetId, titleSnapshot: targetId } as const)
      : null;
    await db.focusSessions.put({
      id: runId,
      target,
      targetId,
      startedAt: at,
      endedAt: at + 25 * MIN,
      plannedMs: 25 * MIN,
      actualMs: 25 * MIN,
      completed: true,
    });
  }

  it('기간은 [from, to)이고 최신순이다', async () => {
    await record('a', T0, null);
    await record('b', T0 + 100, 't1');
    await record('c', T0 + 200, null);

    const ids = (await listSessionsBetween(T0, T0 + 200)).map((s) => s.id);
    expect(ids).toEqual(['b', 'a']);
  });

  it('대상별 조회와 누적 합계', async () => {
    await record('a', T0, 't1');
    await record('b', T0 + 1, 't2');
    await record('c', T0 + 2, 't1');
    await record('d', T0 + 3, null);

    expect((await listSessionsByTarget('t1')).map((s) => s.id)).toEqual(['c', 'a']);
    const totals = await sumFocusByTarget();
    expect(totals.get('t1')).toBe(50 * MIN);
    expect(totals.get('t2')).toBe(25 * MIN);
    expect(totals.size).toBe(2);
  });

  it('대상 할 일을 삭제해도 세션 기록은 남고 이름 스냅샷으로 표시할 수 있다', async () => {
    const task = await createTask({ title: '보고서' });
    await transitionTimer(
      0,
      {
        type: 'start',
        runId: 'r1',
        target: { type: 'task', id: task.id, titleSnapshot: task.title },
      },
      T0,
    );
    await transitionTimer(1, { type: 'complete', nextRunId: 'n' }, T0 + 25 * MIN);

    await deleteTask(task.id);

    const sessions = await listSessionsByTarget(task.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.target?.titleSnapshot).toBe('보고서');
    expect(await db.tasks.get(task.id)).toBeUndefined();
  });
});
