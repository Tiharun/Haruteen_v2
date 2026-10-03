import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMER_STATE,
  displayPlannedMs,
  documentTitle,
  elapsedMs,
  endsAt,
  formatClock,
  formatDuration,
  isDue,
  MIN_RECORD_MS,
  phaseDurationMs,
  progressRatio,
  reduceTimer,
  remainingMs,
  setProgress,
  type TimerAction,
  type TimerResult,
  type TimerSettings,
} from '../timer';
import type { FocusTarget, TimerState } from '../types';

const MIN = 60_000;
const T0 = 1_700_000_000_000;

const SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreak: false,
  autoStartFocus: false,
};

const TASK: FocusTarget = { type: 'task', id: 't1', titleSnapshot: '보고서' };

/** 동작을 차례로 적용하고 마지막 결과를 돌려준다. */
function run(
  steps: { action: TimerAction; at: number }[],
  settings: TimerSettings = SETTINGS,
  from: TimerState = DEFAULT_TIMER_STATE,
) {
  let state = from;
  let last: TimerResult | undefined;
  for (const step of steps) {
    last = reduceTimer(state, step.action, step.at, settings);
    state = last.state;
  }
  if (!last) throw new Error('steps가 비어 있어요');
  return last;
}

function started(at = T0, settings = SETTINGS, target?: FocusTarget): TimerState {
  return reduceTimer(DEFAULT_TIMER_STATE, { type: 'start', runId: 'r1', target }, at, settings)
    .state;
}

describe('시작', () => {
  it('idle에서 시작하면 running이 되고 설정값·시작 시각이 고정된다', () => {
    const result = reduceTimer(DEFAULT_TIMER_STATE, { type: 'start', runId: 'r1' }, T0, SETTINGS);
    expect(result.changed).toBe(true);
    expect(result.state).toMatchObject({
      status: 'running',
      phase: 'focus',
      runId: 'r1',
      plannedMs: 25 * MIN,
      accumulatedMs: 0,
      runningSince: T0,
      firstStartedAt: T0,
      revision: 1,
    });
  });

  it('진행 중에는 설정을 바꿔도 plannedMs가 그대로이고 다음 단계부터 적용된다', () => {
    const state = started();
    const changed = { ...SETTINGS, focusMinutes: 50, shortBreakMinutes: 10 };
    expect(displayPlannedMs(state, changed)).toBe(25 * MIN);
    const done = reduceTimer(state, { type: 'complete', nextRunId: 'r2' }, T0 + 25 * MIN, changed);
    expect(done.state.phase).toBe('shortBreak');
    expect(displayPlannedMs(done.state, changed)).toBe(10 * MIN);
  });

  it('이미 진행 중이면 시작할 수 없다', () => {
    const state = started();
    const result = reduceTimer(state, { type: 'start', runId: 'r2' }, T0 + 1000, SETTINGS);
    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('대상을 함께 넘기면 대기 중이던 휴식을 건너뛰고 그 대상으로 집중을 시작한다', () => {
    const waitingBreak: TimerState = { ...DEFAULT_TIMER_STATE, phase: 'shortBreak' };
    const result = reduceTimer(
      waitingBreak,
      { type: 'start', runId: 'r1', target: TASK },
      T0,
      SETTINGS,
    );
    expect(result.state).toMatchObject({ phase: 'focus', target: TASK, plannedMs: 25 * MIN });
  });

  it('대상을 넘겨 시작하면 대기 중이던 짧은 휴식을 건너뛰어도 세트 횟수는 유지된다', () => {
    const waitingBreak: TimerState = {
      ...DEFAULT_TIMER_STATE,
      phase: 'shortBreak',
      completedFocusInSet: 1,
    };
    const result = reduceTimer(
      waitingBreak,
      { type: 'start', runId: 'r1', target: TASK },
      T0,
      SETTINGS,
    );
    expect(result.state).toMatchObject({ phase: 'focus', completedFocusInSet: 1 });
  });

  it('대상을 넘겨 시작하면 대기 중이던 긴 휴식을 건너뛰고 세트가 초기화된다', () => {
    const waitingBreak: TimerState = {
      ...DEFAULT_TIMER_STATE,
      phase: 'longBreak',
      completedFocusInSet: 4,
    };
    const result = reduceTimer(
      waitingBreak,
      { type: 'start', runId: 'r1', target: TASK },
      T0,
      SETTINGS,
    );
    expect(result.state).toMatchObject({
      status: 'running',
      phase: 'focus',
      completedFocusInSet: 0,
    });
  });

  it('대상을 넘기지 않으면 대기 중인 휴식을 그대로 시작하고 대상은 유지한다', () => {
    const waitingBreak: TimerState = { ...DEFAULT_TIMER_STATE, phase: 'longBreak', target: TASK };
    const result = reduceTimer(waitingBreak, { type: 'start', runId: 'r1' }, T0, SETTINGS);
    expect(result.state).toMatchObject({ phase: 'longBreak', target: TASK, plannedMs: 15 * MIN });
  });
});

describe('일시정지·재개', () => {
  it('일시정지 구간은 진행 시간에서 제외된다', () => {
    const result = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'pause' }, at: T0 + 20_000 },
      { action: { type: 'resume' }, at: T0 + 120_000 },
    ]);
    expect(result.state).toMatchObject({
      status: 'running',
      accumulatedMs: 20_000,
      runningSince: T0 + 120_000,
    });
    expect(elapsedMs(result.state, T0 + 160_000)).toBe(60_000);
    expect(remainingMs(result.state, T0 + 160_000)).toBe(25 * MIN - 60_000);
    expect(endsAt(result.state)).toBe(T0 + 120_000 + 25 * MIN - 20_000);
  });

  it('일시정지 중에는 시간이 흐르지 않는다', () => {
    const paused = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'pause' }, at: T0 + 10_000 },
    ]).state;
    expect(paused).toMatchObject({ status: 'paused', runningSince: null, accumulatedMs: 10_000 });
    expect(remainingMs(paused, T0 + 10 * MIN)).toBe(25 * MIN - 10_000);
    expect(endsAt(paused)).toBeNull();
    expect(isDue(paused, T0 + 999 * MIN)).toBe(false);
  });

  it('잘못된 상태의 동작은 무시된다', () => {
    const idle = DEFAULT_TIMER_STATE;
    expect(reduceTimer(idle, { type: 'pause' }, T0, SETTINGS).changed).toBe(false);
    expect(reduceTimer(idle, { type: 'resume' }, T0, SETTINGS).changed).toBe(false);
    expect(reduceTimer(idle, { type: 'stop' }, T0, SETTINGS).changed).toBe(false);
    expect(reduceTimer(idle, { type: 'skip', runId: 'x' }, T0, SETTINGS).changed).toBe(false);
    const running = started();
    expect(reduceTimer(running, { type: 'resume' }, T0 + 1, SETTINGS).changed).toBe(false);
  });
});

describe('중단', () => {
  it('1분 미만이면 기록하지 않고 idle(집중)로 돌아간다', () => {
    const result = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'stop' }, at: T0 + 30_000 },
    ]);
    expect(result.sessionToRecord).toBeUndefined();
    expect(result.state).toMatchObject({
      status: 'idle',
      phase: 'focus',
      runId: null,
      accumulatedMs: 0,
      runningSince: null,
      firstStartedAt: null,
    });
  });

  it('정확히 60초면 completed=false로 기록한다(경계값)', () => {
    const below = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'stop' }, at: T0 + MIN_RECORD_MS - 1 },
    ]);
    expect(below.sessionToRecord).toBeUndefined();

    const exact = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'stop' }, at: T0 + MIN_RECORD_MS },
    ]);
    expect(exact.sessionToRecord).toMatchObject({ actualMs: MIN_RECORD_MS, completed: false });
  });

  it('2분 뒤 중단하면 실제 시간으로 기록한다', () => {
    const result = run([
      { action: { type: 'start', runId: 'r1', target: TASK }, at: T0 },
      { action: { type: 'stop' }, at: T0 + 2 * MIN },
    ]);
    expect(result.sessionToRecord).toEqual({
      id: 'r1',
      target: TASK,
      targetId: 't1',
      startedAt: T0,
      endedAt: T0 + 2 * MIN,
      plannedMs: 25 * MIN,
      actualMs: 2 * MIN,
      completed: false,
    });
  });

  it('일시정지한 시간은 실제 시간에서 빠진다', () => {
    const result = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'pause' }, at: T0 + 90_000 },
      { action: { type: 'stop' }, at: T0 + 10 * MIN },
    ]);
    expect(result.sessionToRecord?.actualMs).toBe(90_000);
  });

  it('중단해도 세트 진행(completedFocusInSet)은 유지된다', () => {
    const from: TimerState = { ...DEFAULT_TIMER_STATE, completedFocusInSet: 2 };
    const result = run(
      [
        { action: { type: 'start', runId: 'r1' }, at: T0 },
        { action: { type: 'stop' }, at: T0 + 5 * MIN },
      ],
      SETTINGS,
      from,
    );
    expect(result.state.completedFocusInSet).toBe(2);
  });

  it('휴식 중 중단은 기록 없이 집중 대기로 돌아간다', () => {
    const breakRunning = reduceTimer(
      { ...DEFAULT_TIMER_STATE, phase: 'shortBreak' },
      { type: 'start', runId: 'b1' },
      T0,
      SETTINGS,
    ).state;
    const result = reduceTimer(breakRunning, { type: 'stop' }, T0 + 2 * MIN, SETTINGS);
    expect(result.sessionToRecord).toBeUndefined();
    expect(result.state).toMatchObject({ status: 'idle', phase: 'focus' });
  });
});

describe('휴식 건너뛰기', () => {
  const breakState = (status: 'idle' | 'running') =>
    status === 'idle'
      ? ({ ...DEFAULT_TIMER_STATE, phase: 'shortBreak' } as TimerState)
      : reduceTimer(
          { ...DEFAULT_TIMER_STATE, phase: 'shortBreak' },
          { type: 'start', runId: 'b1' },
          T0,
          SETTINGS,
        ).state;

  it('진행 중인 휴식을 건너뛰면 기록 없이 idle(집중)', () => {
    const result = reduceTimer(
      breakState('running'),
      { type: 'skip', runId: 'r2' },
      T0 + 1000,
      SETTINGS,
    );
    expect(result.sessionToRecord).toBeUndefined();
    expect(result.state).toMatchObject({ status: 'idle', phase: 'focus', runId: null });
  });

  it('대기 중인 휴식도 건너뛸 수 있다', () => {
    const result = reduceTimer(breakState('idle'), { type: 'skip', runId: 'r2' }, T0, SETTINGS);
    expect(result.state).toMatchObject({ status: 'idle', phase: 'focus' });
  });

  it('autoStartFocus면 바로 집중이 시작된다', () => {
    const result = reduceTimer(breakState('running'), { type: 'skip', runId: 'r2' }, T0 + 1000, {
      ...SETTINGS,
      autoStartFocus: true,
    });
    expect(result.state).toMatchObject({
      status: 'running',
      phase: 'focus',
      runId: 'r2',
      runningSince: T0 + 1000,
    });
  });

  it('짧은 휴식을 건너뛰면 세트 횟수는 유지된다', () => {
    const waiting: TimerState = {
      ...DEFAULT_TIMER_STATE,
      phase: 'shortBreak',
      completedFocusInSet: 2,
    };
    const result = reduceTimer(waiting, { type: 'skip', runId: 'r2' }, T0, SETTINGS);
    expect(result.state).toMatchObject({ phase: 'focus', completedFocusInSet: 2 });
  });

  it('대기 중인 긴 휴식을 건너뛰면 세트가 초기화된다', () => {
    const waiting: TimerState = {
      ...DEFAULT_TIMER_STATE,
      phase: 'longBreak',
      completedFocusInSet: 4,
    };
    const result = reduceTimer(waiting, { type: 'skip', runId: 'r2' }, T0, SETTINGS);
    expect(result.state).toMatchObject({ status: 'idle', phase: 'focus', completedFocusInSet: 0 });
  });

  it('진행 중인 긴 휴식을 건너뛰면 세트가 초기화된다', () => {
    const running = reduceTimer(
      { ...DEFAULT_TIMER_STATE, phase: 'longBreak', completedFocusInSet: 4 },
      { type: 'start', runId: 'lb' },
      T0,
      SETTINGS,
    ).state;
    const result = reduceTimer(running, { type: 'skip', runId: 'r2' }, T0 + MIN, SETTINGS);
    expect(result.state).toMatchObject({ status: 'idle', phase: 'focus', completedFocusInSet: 0 });
  });

  it('긴 휴식을 건너뛰고 autoStartFocus로 바로 시작해도 세트가 초기화된다', () => {
    const waiting: TimerState = {
      ...DEFAULT_TIMER_STATE,
      phase: 'longBreak',
      completedFocusInSet: 4,
    };
    const result = reduceTimer(waiting, { type: 'skip', runId: 'r2' }, T0, {
      ...SETTINGS,
      autoStartFocus: true,
    });
    expect(result.state).toMatchObject({
      status: 'running',
      phase: 'focus',
      completedFocusInSet: 0,
    });
  });

  it('집중 단계에서는 건너뛸 수 없다', () => {
    expect(reduceTimer(started(), { type: 'skip', runId: 'x' }, T0 + 1, SETTINGS).changed).toBe(
      false,
    );
  });
});

describe('집중 완료', () => {
  it('세션을 completed=true로 기록하고 endedAt은 완료 예정 시각이다', () => {
    // 감지가 3초 늦어도 endedAt은 예정 시각
    const result = reduceTimer(
      started(T0, SETTINGS, TASK),
      { type: 'complete', nextRunId: 'r2' },
      T0 + 25 * MIN + 3000,
      SETTINGS,
    );
    expect(result.sessionToRecord).toEqual({
      id: 'r1',
      target: TASK,
      targetId: 't1',
      startedAt: T0,
      endedAt: T0 + 25 * MIN,
      plannedMs: 25 * MIN,
      actualMs: 25 * MIN,
      completed: true,
    });
    expect(result.state).toMatchObject({
      status: 'idle',
      phase: 'shortBreak',
      completedFocusInSet: 1,
      runId: null,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'completed',
        phase: 'focus',
        restored: false,
        nextPhase: 'shortBreak',
        autoStarted: false,
      }),
    ]);
  });

  it('일시정지가 있었어도 plannedMs만큼 진행했을 때 끝나고, 시작 시각은 처음 시작한 때다', () => {
    const result = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'pause' }, at: T0 + 10 * MIN },
      { action: { type: 'resume' }, at: T0 + 30 * MIN },
      { action: { type: 'complete', nextRunId: 'r2' }, at: T0 + 45 * MIN },
    ]);
    expect(result.changed).toBe(true);
    expect(result.sessionToRecord).toMatchObject({
      startedAt: T0,
      endedAt: T0 + 45 * MIN,
      actualMs: 25 * MIN,
    });
  });

  it('남은 시간이 있으면 완료되지 않는다', () => {
    const result = reduceTimer(
      started(),
      { type: 'complete', nextRunId: 'r2' },
      T0 + 25 * MIN - 1,
      SETTINGS,
    );
    expect(result.changed).toBe(false);
    expect(result.sessionToRecord).toBeUndefined();
  });

  it('autoStartBreak면 다음 휴식이 바로 시작된다', () => {
    const settings = { ...SETTINGS, autoStartBreak: true };
    const result = reduceTimer(
      started(T0, settings),
      { type: 'complete', nextRunId: 'b1' },
      T0 + 25 * MIN + 500,
      settings,
    );
    expect(result.state).toMatchObject({
      status: 'running',
      phase: 'shortBreak',
      runId: 'b1',
      plannedMs: 5 * MIN,
      // 늦게 감지해도 이전 단계가 끝난 시각에서 이어 붙는다
      runningSince: T0 + 25 * MIN,
      firstStartedAt: T0 + 25 * MIN,
      completedFocusInSet: 1,
    });
    expect(result.events[0]).toMatchObject({ autoStarted: true });
  });

  it('자동 시작은 1분 안에 감지하면 끝난 시각에서, 그보다 늦으면 감지한 시각에서 시작한다', () => {
    const settings = { ...SETTINGS, autoStartBreak: true };
    const end = T0 + 25 * MIN;
    const late = reduceTimer(
      started(T0, settings),
      { type: 'complete', nextRunId: 'b1' },
      end + 59_000,
      settings,
    );
    expect(late.state.runningSince).toBe(end);

    const veryLate = reduceTimer(
      started(T0, settings),
      { type: 'complete', nextRunId: 'b1' },
      end + 61_000,
      settings,
    );
    expect(veryLate.state.runningSince).toBe(end + 61_000);
  });

  it('autoStartFocus도 휴식이 끝난 시각에서 이어 붙는다', () => {
    const settings = { ...SETTINGS, autoStartFocus: true };
    const breakRunning = reduceTimer(
      { ...DEFAULT_TIMER_STATE, phase: 'shortBreak' },
      { type: 'start', runId: 'b1' },
      T0,
      settings,
    ).state;
    const result = reduceTimer(
      breakRunning,
      { type: 'complete', nextRunId: 'f2' },
      T0 + 5 * MIN + 20_000,
      settings,
    );
    expect(result.state).toMatchObject({
      status: 'running',
      phase: 'focus',
      runningSince: T0 + 5 * MIN,
    });
  });

  it('끝나는 순간 다른 동작(일시정지)이 들어오면 완료로 처리한다', () => {
    const result = reduceTimer(started(), { type: 'pause' }, T0 + 25 * MIN + 200, SETTINGS);
    expect(result.state.status).toBe('idle');
    expect(result.state.phase).toBe('shortBreak');
    expect(result.sessionToRecord).toMatchObject({ completed: true, actualMs: 25 * MIN });
  });

  it('끝나는 순간 중단이 들어와도 완료로 기록한다(중단 기록이 아님)', () => {
    const result = reduceTimer(started(), { type: 'stop' }, T0 + 25 * MIN + 200, SETTINGS);
    expect(result.sessionToRecord).toMatchObject({ completed: true });
  });
});

describe('긴 휴식과 세트', () => {
  function completeFocus(state: TimerState, at: number, settings = SETTINGS) {
    const running = reduceTimer(state, { type: 'start', runId: `f${at}` }, at, settings).state;
    return reduceTimer(
      running,
      { type: 'complete', nextRunId: `n${at}` },
      at + settings.focusMinutes * MIN,
      settings,
    );
  }

  it('4번째 집중이 끝난 다음 단계가 긴 휴식이다(1~3번째는 짧은 휴식)', () => {
    let state = DEFAULT_TIMER_STATE;
    const phases: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = completeFocus(state, T0 + i * 100 * MIN);
      phases.push(result.state.phase);
      state = result.state;
      if (i < 3) {
        // 짧은 휴식을 지나 집중으로 돌아온다
        const br = reduceTimer(
          state,
          { type: 'skip', runId: 'x' },
          T0 + i * 100 * MIN + 30 * MIN,
          SETTINGS,
        );
        state = br.state;
      }
    }
    expect(phases).toEqual(['shortBreak', 'shortBreak', 'shortBreak', 'longBreak']);
    expect(state.completedFocusInSet).toBe(4);
  });

  it('1분 집중으로 4번 마치면 4번째 다음이 긴 휴식이다', () => {
    const settings = { ...SETTINGS, focusMinutes: 1, shortBreakMinutes: 1 };
    let state = DEFAULT_TIMER_STATE;
    let at = T0;
    for (let i = 0; i < 4; i += 1) {
      const result = completeFocus(state, at, settings);
      state = result.state;
      at += 5 * MIN;
      if (i < 3) {
        expect(state.phase).toBe('shortBreak');
        // 짧은 휴식을 끝까지 진행
        const br = reduceTimer(state, { type: 'start', runId: `b${i}` }, at, settings).state;
        state = reduceTimer(
          br,
          { type: 'complete', nextRunId: 'z' },
          at + settings.shortBreakMinutes * MIN,
          settings,
        ).state;
        at += 5 * MIN;
      }
    }
    expect(state.phase).toBe('longBreak');
  });

  it('긴 휴식이 끝나면 세트가 초기화되고 다음은 집중이다', () => {
    const state: TimerState = {
      ...DEFAULT_TIMER_STATE,
      phase: 'longBreak',
      completedFocusInSet: 4,
    };
    const running = reduceTimer(state, { type: 'start', runId: 'lb' }, T0, SETTINGS).state;
    const result = reduceTimer(
      running,
      { type: 'complete', nextRunId: 'n' },
      T0 + 15 * MIN,
      SETTINGS,
    );
    expect(result.state).toMatchObject({ phase: 'focus', status: 'idle', completedFocusInSet: 0 });
    expect(result.sessionToRecord).toBeUndefined();
    expect(result.events[0]).toMatchObject({ phase: 'longBreak', nextPhase: 'focus' });
  });

  it('짧은 휴식이 끝나도 세트는 유지된다', () => {
    const state: TimerState = {
      ...DEFAULT_TIMER_STATE,
      phase: 'shortBreak',
      completedFocusInSet: 2,
    };
    const running = reduceTimer(state, { type: 'start', runId: 'sb' }, T0, SETTINGS).state;
    const result = reduceTimer(
      running,
      { type: 'complete', nextRunId: 'n' },
      T0 + 5 * MIN,
      SETTINGS,
    );
    expect(result.state.completedFocusInSet).toBe(2);
  });

  it('autoStartFocus면 휴식이 끝나자마자 집중이 시작된다', () => {
    const settings = { ...SETTINGS, autoStartFocus: true };
    const state: TimerState = { ...DEFAULT_TIMER_STATE, phase: 'shortBreak' };
    const running = reduceTimer(state, { type: 'start', runId: 'sb' }, T0, settings).state;
    const result = reduceTimer(
      running,
      { type: 'complete', nextRunId: 'f2' },
      T0 + 5 * MIN,
      settings,
    );
    expect(result.state).toMatchObject({ status: 'running', phase: 'focus', runId: 'f2' });
  });

  it('세트 초기화는 idle일 때만, 0이 아닐 때만 동작한다', () => {
    const idle: TimerState = { ...DEFAULT_TIMER_STATE, completedFocusInSet: 3 };
    const result = reduceTimer(idle, { type: 'resetSet' }, T0, SETTINGS);
    expect(result.state.completedFocusInSet).toBe(0);
    expect(result.changed).toBe(true);
    expect(reduceTimer(result.state, { type: 'resetSet' }, T0, SETTINGS).changed).toBe(false);

    const running = reduceTimer({ ...idle }, { type: 'start', runId: 'r' }, T0, SETTINGS).state;
    expect(reduceTimer(running, { type: 'resetSet' }, T0 + 1, SETTINGS).changed).toBe(false);
  });

  it('세트 진행 표시: 긴 휴식 대기 중에는 가득 찬 상태', () => {
    const at = (n: number) =>
      setProgress({ ...DEFAULT_TIMER_STATE, completedFocusInSet: n }, SETTINGS);
    expect(at(0)).toEqual({ done: 0, total: 4 });
    expect(at(2)).toEqual({ done: 2, total: 4 });
    expect(at(4)).toEqual({ done: 4, total: 4 });
    expect(at(5)).toEqual({ done: 1, total: 4 });
  });
});

describe('대상', () => {
  it('idle에서만 바꿀 수 있다', () => {
    const idle = reduceTimer(
      DEFAULT_TIMER_STATE,
      { type: 'setTarget', target: TASK },
      T0,
      SETTINGS,
    );
    expect(idle.changed).toBe(true);
    expect(idle.state.target).toEqual(TASK);

    const running = reduceTimer(idle.state, { type: 'start', runId: 'r' }, T0, SETTINGS).state;
    const denied = reduceTimer(running, { type: 'setTarget', target: null }, T0 + 1, SETTINGS);
    expect(denied.changed).toBe(false);
    expect(denied.state.target).toEqual(TASK);

    const paused = reduceTimer(running, { type: 'pause' }, T0 + 1000, SETTINGS).state;
    expect(
      reduceTimer(paused, { type: 'setTarget', target: null }, T0 + 2000, SETTINGS).changed,
    ).toBe(false);
  });

  it('같은 대상으로 다시 고르면 revision이 올라가지 않는다', () => {
    const state = reduceTimer(
      DEFAULT_TIMER_STATE,
      { type: 'setTarget', target: TASK },
      T0,
      SETTINGS,
    ).state;
    const again = reduceTimer(state, { type: 'setTarget', target: { ...TASK } }, T0, SETTINGS);
    expect(again.changed).toBe(false);
    expect(again.state.revision).toBe(state.revision);
  });

  it('대상 없이 집중하면 세션의 targetId가 null이다', () => {
    const result = run([
      { action: { type: 'start', runId: 'r1' }, at: T0 },
      { action: { type: 'complete', nextRunId: 'r2' }, at: T0 + 25 * MIN },
    ]);
    expect(result.sessionToRecord).toMatchObject({ target: null, targetId: null });
  });

  it('휴식을 지나도 대상이 유지된다', () => {
    const afterFocus = reduceTimer(
      started(T0, SETTINGS, TASK),
      { type: 'complete', nextRunId: 'r2' },
      T0 + 25 * MIN,
      SETTINGS,
    ).state;
    expect(afterFocus.target).toEqual(TASK);
  });
});

describe('복원 (앱을 다시 열었을 때)', () => {
  it('완료 시각이 지났으면 예정 시각에 끝난 것으로 기록하고, auto 설정이 켜져 있어도 다음 단계는 idle', () => {
    const settings = { ...SETTINGS, autoStartBreak: true };
    const state = started(T0, settings, TASK);
    const reopenedAt = T0 + 27 * MIN; // 2분 뒤에 다시 열었다
    expect(isDue(state, reopenedAt)).toBe(true);

    const result = reduceTimer(
      state,
      { type: 'complete', nextRunId: 'n', restored: true },
      reopenedAt,
      settings,
    );
    expect(result.sessionToRecord).toMatchObject({
      endedAt: T0 + 25 * MIN,
      actualMs: 25 * MIN,
      completed: true,
    });
    expect(result.state).toMatchObject({ status: 'idle', phase: 'shortBreak', runId: null });
    expect(result.events[0]).toMatchObject({
      restored: true,
      autoStarted: false,
      actualMs: 25 * MIN,
    });
  });

  it('아직 남았으면 그대로 이어서 표시한다', () => {
    const state = started();
    const result = reduceTimer(
      state,
      { type: 'complete', nextRunId: 'n', restored: true },
      T0 + 10 * MIN,
      SETTINGS,
    );
    expect(result.changed).toBe(false);
    expect(remainingMs(state, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it('일시정지 상태는 아무리 시간이 지나도 그대로다', () => {
    const paused = reduceTimer(started(), { type: 'pause' }, T0 + MIN, SETTINGS).state;
    const result = reduceTimer(
      paused,
      { type: 'complete', nextRunId: 'n', restored: true },
      T0 + 999 * MIN,
      SETTINGS,
    );
    expect(result.changed).toBe(false);
    expect(result.state).toBe(paused);
  });

  it('휴식 중 복원: 끝난 휴식은 기록 없이 집중 대기', () => {
    const state = reduceTimer(
      { ...DEFAULT_TIMER_STATE, phase: 'shortBreak' },
      { type: 'start', runId: 'b' },
      T0,
      SETTINGS,
    ).state;
    const result = reduceTimer(
      state,
      { type: 'complete', nextRunId: 'n', restored: true },
      T0 + 30 * MIN,
      { ...SETTINGS, autoStartFocus: true },
    );
    expect(result.sessionToRecord).toBeUndefined();
    expect(result.state).toMatchObject({ status: 'idle', phase: 'focus' });
  });
});

describe('revision', () => {
  it('상태가 바뀔 때마다 1씩 오르고, 바뀌지 않으면 그대로다', () => {
    let state = DEFAULT_TIMER_STATE;
    const revisions = [state.revision];
    const steps: [TimerAction, number][] = [
      [{ type: 'start', runId: 'r' }, T0],
      [{ type: 'pause' }, T0 + 1000],
      [{ type: 'resume' }, T0 + 2000],
      [{ type: 'stop' }, T0 + 3000],
    ];
    for (const [action, at] of steps) {
      state = reduceTimer(state, action, at, SETTINGS).state;
      revisions.push(state.revision);
    }
    expect(revisions).toEqual([0, 1, 2, 3, 4]);

    const ignored = reduceTimer(state, { type: 'pause' }, T0 + 4000, SETTINGS);
    expect(ignored.state.revision).toBe(4);
  });

  it('입력 상태를 바꾸지 않는다', () => {
    const state = started();
    const copy = structuredClone(state);
    reduceTimer(state, { type: 'pause' }, T0 + 5000, SETTINGS);
    reduceTimer(state, { type: 'stop' }, T0 + 5000, SETTINGS);
    expect(state).toEqual(copy);
  });
});

describe('표시 도우미', () => {
  it('idle이면 설정값 전체를 남은 시간으로 보여 준다', () => {
    expect(remainingMs(DEFAULT_TIMER_STATE, T0, SETTINGS)).toBe(25 * MIN);
    expect(phaseDurationMs('longBreak', SETTINGS)).toBe(15 * MIN);
  });

  it('진행 비율은 0~1로 제한된다', () => {
    const state = started();
    expect(progressRatio(state, T0)).toBe(0);
    expect(progressRatio(state, T0 + 5 * MIN)).toBeCloseTo(0.2);
    expect(progressRatio(state, T0 + 99 * MIN)).toBe(1);
    expect(progressRatio(DEFAULT_TIMER_STATE, T0)).toBe(0);
  });

  it('남은 시간은 올림해서 mm:ss로 보여 준다', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(90 * MIN)).toBe('1:30:00');
  });

  it('걸린 시간을 한국어로 보여 준다', () => {
    expect(formatDuration(25 * MIN)).toBe('25분');
    expect(formatDuration(90_000)).toBe('1분 30초');
    expect(formatDuration(45_000)).toBe('45초');
    expect(formatDuration(65 * MIN)).toBe('1시간 5분');
    expect(formatDuration(60 * MIN)).toBe('1시간');
  });

  it('탭 제목: 진행 중 ▶, 일시정지 ⏸, idle이면 앱 이름', () => {
    const running = started();
    expect(documentTitle(running, T0 + 13 * MIN + 26_000, '하루틴', true)).toBe(
      '▶ 11:34 집중 · 하루틴',
    );
    const paused = reduceTimer(running, { type: 'pause' }, T0 + 13 * MIN + 26_000, SETTINGS).state;
    expect(documentTitle(paused, T0 + 99 * MIN, '하루틴', true)).toBe('⏸ 11:34 집중 · 하루틴');
    expect(documentTitle(DEFAULT_TIMER_STATE, T0, '하루틴', true)).toBe('하루틴');
    expect(documentTitle(running, T0, '하루틴', false)).toBe('하루틴');
  });
});
