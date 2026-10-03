// DESIGN.md §4.4 타이머 상태 기계. 순수 함수만 둔다. 현재 시각·설정·새 ID는 모두 인자로 받는다.
import type { FocusSession, FocusTarget, ID, Settings, TimerPhase, TimerState } from './types';

/** 집중을 중단했을 때 기록으로 남기는 최소 시간 (DESIGN.md §4.4) */
export const MIN_RECORD_MS = 60_000;

export const DEFAULT_TIMER_STATE: TimerState = {
  key: 'timer',
  revision: 0,
  runId: null,
  phase: 'focus',
  status: 'idle',
  target: null,
  plannedMs: 0,
  accumulatedMs: 0,
  runningSince: null,
  firstStartedAt: null,
  completedFocusInSet: 0,
};

export type TimerSettings = Pick<
  Settings,
  | 'focusMinutes'
  | 'shortBreakMinutes'
  | 'longBreakMinutes'
  | 'longBreakInterval'
  | 'autoStartBreak'
  | 'autoStartFocus'
>;

export type TimerAction =
  /**
   * idle → running. target을 넘기면 그 대상으로 바꿔 시작하고, 대기 중이던 휴식은 건너뛰고 집중으로 시작한다
   * (▶ 버튼은 "이 대상으로 집중"이라는 뜻이므로. 긴 휴식이었으면 세트도 초기화). target을 생략하면 대기 중인 단계를 그대로 시작한다.
   */
  | { type: 'start'; runId: ID; target?: FocusTarget }
  | { type: 'pause' }
  | { type: 'resume' }
  /** 집중이면 60초 이상 했을 때 기록. 어떤 단계든 idle(집중)으로 돌아간다. */
  | { type: 'stop' }
  /**
   * 휴식 건너뛰기(대기 중인 휴식 포함). 긴 휴식이면 completedFocusInSet을 0으로 되돌린다.
   * autoStartFocus면 바로 집중을 시작하므로 runId가 필요하다.
   */
  | { type: 'skip'; runId: ID }
  | { type: 'setTarget'; target: FocusTarget }
  | { type: 'resetSet' }
  /**
   * 남은 시간이 0 이하인 running 단계를 끝낸다. nextRunId는 다음 단계를 자동 시작할 때 쓰는 새 ID.
   * restored(앱을 다시 열어 발견한 경우)면 auto 설정과 관계없이 다음 단계는 idle.
   */
  | { type: 'complete'; nextRunId: ID; restored?: boolean };

export type TimerEvent = {
  type: 'completed';
  /** 끝난 단계 */
  phase: TimerPhase;
  restored: boolean;
  /** 집중이면 기록된 시간, 휴식이면 휴식 길이 */
  actualMs: number;
  /** 끝난 단계의 대상(집중일 때만 의미 있음) */
  target: FocusTarget;
  nextPhase: TimerPhase;
  /** 다음 단계가 바로 시작됐는지 */
  autoStarted: boolean;
};

export interface TimerResult {
  state: TimerState;
  /** 상태가 실제로 바뀌었는지. false이면 state는 입력과 같고 revision도 그대로다. */
  changed: boolean;
  sessionToRecord?: FocusSession;
  events: TimerEvent[];
}

// ---- 파생값 ----

export function phaseDurationMs(phase: TimerPhase, settings: TimerSettings): number {
  const minutes =
    phase === 'focus'
      ? settings.focusMinutes
      : phase === 'shortBreak'
        ? settings.shortBreakMinutes
        : settings.longBreakMinutes;
  return minutes * 60_000;
}

/** 화면에 보여 줄 이 단계의 총 길이. 진행 중이면 시작 때 고정된 값, idle이면 지금 설정값. */
export function displayPlannedMs(state: TimerState, settings: TimerSettings): number {
  return state.status === 'idle' ? phaseDurationMs(state.phase, settings) : state.plannedMs;
}

/** 지금까지 진행한 시간(일시정지 구간 제외). */
export function elapsedMs(state: TimerState, now: number): number {
  const running =
    state.status === 'running' && state.runningSince !== null ? now - state.runningSince : 0;
  return state.accumulatedMs + Math.max(0, running);
}

/** 남은 시간. idle이면 아직 시작 전이므로 설정값 전체를 돌려주고(settings를 받을 때), 음수는 0으로 맞춘다. */
export function remainingMs(state: TimerState, now: number, settings?: TimerSettings): number {
  if (state.status === 'idle') return settings ? phaseDurationMs(state.phase, settings) : 0;
  return Math.max(0, state.plannedMs - elapsedMs(state, now));
}

/** 완료 예정 시각. running이 아니면 null. */
export function endsAt(state: TimerState): number | null {
  if (state.status !== 'running' || state.runningSince === null) return null;
  return state.runningSince + state.plannedMs - state.accumulatedMs;
}

/** running이고 남은 시간이 0 이하인지(= 완료 처리 대상). */
export function isDue(state: TimerState, now: number): boolean {
  const end = endsAt(state);
  return end !== null && now >= end;
}

/** 진행 비율 0~1 (idle이면 0). */
export function progressRatio(state: TimerState, now: number): number {
  if (state.status === 'idle' || state.plannedMs <= 0) return 0;
  return Math.min(1, elapsedMs(state, now) / state.plannedMs);
}

/** 세트 진행 표시용: 긴 휴식 전까지 몇 번째까지 마쳤는지. 긴 휴식 대기·진행 중이면 total과 같다. */
export function setProgress(
  state: TimerState,
  settings: Pick<TimerSettings, 'longBreakInterval'>,
): { done: number; total: number } {
  const total = settings.longBreakInterval;
  const count = state.completedFocusInSet;
  const done = count > 0 && count % total === 0 ? total : count % total;
  return { done, total };
}

function nextPhaseAfterFocus(completedFocusInSet: number, interval: number): TimerPhase {
  return completedFocusInSet % interval === 0 ? 'longBreak' : 'shortBreak';
}

// ---- 표시 형식 ----

/** 남은 시간을 `mm:ss`로. 올림해서 0초 직전까지 1초가 남아 보이게 한다. 60분 이상이면 `h:mm:ss`. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** 걸린 시간을 한국어로. 예: `25분`, `1분 30초`, `1시간 5분`, `45초` */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}

export const PHASE_LABEL: Record<TimerPhase, string> = {
  focus: '집중',
  shortBreak: '짧은 휴식',
  longBreak: '긴 휴식',
};

/** 탭 제목. 진행 중 `▶ 12:34 집중 · 하루틴`, 일시정지 `⏸ …`, idle이면 앱 이름만. */
export function documentTitle(
  state: TimerState,
  now: number,
  appName: string,
  showTimer: boolean,
): string {
  if (!showTimer || state.status === 'idle') return appName;
  const icon = state.status === 'running' ? '▶' : '⏸';
  return `${icon} ${formatClock(remainingMs(state, now))} ${PHASE_LABEL[state.phase]} · ${appName}`;
}

// ---- 전이 ----

const UNCHANGED = (state: TimerState): TimerResult => ({ state, changed: false, events: [] });

function changedTo(state: TimerState, next: Omit<TimerState, 'revision'>): TimerState {
  return { ...next, revision: state.revision + 1 };
}

function idleState(
  state: TimerState,
  patch: Partial<Omit<TimerState, 'key' | 'revision'>>,
  settings: TimerSettings,
): TimerState {
  const phase = patch.phase ?? state.phase;
  return changedTo(state, {
    ...state,
    runId: null,
    status: 'idle',
    plannedMs: phaseDurationMs(phase, settings),
    accumulatedMs: 0,
    runningSince: null,
    firstStartedAt: null,
    ...patch,
  });
}

function runningState(
  state: TimerState,
  phase: TimerPhase,
  runId: ID,
  now: number,
  settings: TimerSettings,
  patch: Partial<Omit<TimerState, 'key' | 'revision'>> = {},
): TimerState {
  return changedTo(state, {
    ...state,
    ...patch,
    runId,
    phase,
    status: 'running',
    plannedMs: phaseDurationMs(phase, settings),
    accumulatedMs: 0,
    runningSince: now,
    firstStartedAt: now,
  });
}

function sameTarget(a: FocusTarget, b: FocusTarget): boolean {
  if (a === null || b === null) return a === b;
  return a.type === b.type && a.id === b.id && a.titleSnapshot === b.titleSnapshot;
}

function buildSession(
  state: TimerState,
  endedAt: number,
  actualMs: number,
  completed: boolean,
): FocusSession | undefined {
  if (state.runId === null || state.firstStartedAt === null) return undefined;
  return {
    id: state.runId, // 실행 ID를 세션 ID로 써서, 같은 실행이 두 번 기록되는 일을 막는다
    target: state.target,
    targetId: state.target?.id ?? null,
    startedAt: state.firstStartedAt,
    endedAt,
    plannedMs: state.plannedMs,
    actualMs,
    completed,
  };
}

/**
 * 자동 시작하는 다음 단계의 시작 시각. 백그라운드 탭은 타이머가 늦게 깨어나므로 완료를 감지한 시각(now)이 아니라
 * 이전 단계가 끝난 시각(end)에서 이어 붙인다. 다만 컴퓨터가 잠들었다 깨어난 것처럼 많이 늦었다면
 * 자리를 비운 시간까지 기록하지 않도록 now에서 시작한다.
 */
const MAX_AUTO_START_LAG_MS = 60_000;
function autoStartAt(end: number, now: number): number {
  return now - end <= MAX_AUTO_START_LAG_MS ? end : now;
}

function complete(
  state: TimerState,
  action: Extract<TimerAction, { type: 'complete' }>,
  now: number,
  settings: TimerSettings,
): TimerResult {
  const end = endsAt(state);
  if (end === null || now < end) return UNCHANGED(state);
  const restored = action.restored ?? false;

  if (state.phase === 'focus') {
    const session = buildSession(state, end, state.plannedMs, true);
    const completedFocusInSet = state.completedFocusInSet + 1;
    const nextPhase = nextPhaseAfterFocus(completedFocusInSet, settings.longBreakInterval);
    const autoStarted = settings.autoStartBreak && !restored;
    const next = autoStarted
      ? runningState(state, nextPhase, action.nextRunId, autoStartAt(end, now), settings, {
          completedFocusInSet,
        })
      : idleState(state, { phase: nextPhase, completedFocusInSet }, settings);
    return {
      state: next,
      changed: true,
      sessionToRecord: session,
      events: [
        {
          type: 'completed',
          phase: 'focus',
          restored,
          actualMs: state.plannedMs,
          target: state.target,
          nextPhase,
          autoStarted,
        },
      ],
    };
  }

  const completedFocusInSet = state.phase === 'longBreak' ? 0 : state.completedFocusInSet;
  const autoStarted = settings.autoStartFocus && !restored;
  const next = autoStarted
    ? runningState(state, 'focus', action.nextRunId, autoStartAt(end, now), settings, {
        completedFocusInSet,
      })
    : idleState(state, { phase: 'focus', completedFocusInSet }, settings);
  return {
    state: next,
    changed: true,
    events: [
      {
        type: 'completed',
        phase: state.phase,
        restored,
        actualMs: state.plannedMs,
        target: state.target,
        nextPhase: 'focus',
        autoStarted,
      },
    ],
  };
}

/**
 * 상태 전이. 잘못된 동작(idle에서 일시정지 등)은 changed=false로 무시한다.
 * 완료 시각이 지난 running 단계에 다른 동작이 들어오면(일시정지를 누르는 순간 이미 끝난 경우 등)
 * 그 동작 대신 완료 처리를 한다. 끝난 집중이 "일시정지된 채 영원히 안 끝나는" 상태가 되는 것을 막는다.
 */
export function reduceTimer(
  state: TimerState,
  action: TimerAction,
  now: number,
  settings: TimerSettings,
): TimerResult {
  if (action.type !== 'complete' && isDue(state, now)) {
    // 순수성을 지키려고 새 ID를 만들지 않고, 끝난 실행의 ID에서 파생한다(실행마다 유일하다).
    const nextRunId = `${state.runId ?? 'run'}:next`;
    return complete(state, { type: 'complete', nextRunId }, now, settings);
  }

  switch (action.type) {
    case 'start': {
      if (state.status !== 'idle') return UNCHANGED(state);
      const forceFocus = action.target !== undefined;
      const phase = forceFocus ? 'focus' : state.phase;
      const target = action.target !== undefined ? action.target : state.target;
      // 대기 중이던 긴 휴식을 건너뛰는 것이므로 세트도 처음부터 다시 센다.
      const skipsLongBreak = forceFocus && state.phase === 'longBreak';
      return {
        state: runningState(state, phase, action.runId, now, settings, {
          target,
          ...(skipsLongBreak ? { completedFocusInSet: 0 } : {}),
        }),
        changed: true,
        events: [],
      };
    }

    case 'pause': {
      if (state.status !== 'running' || state.runningSince === null) return UNCHANGED(state);
      return {
        state: changedTo(state, {
          ...state,
          status: 'paused',
          accumulatedMs: state.accumulatedMs + Math.max(0, now - state.runningSince),
          runningSince: null,
        }),
        changed: true,
        events: [],
      };
    }

    case 'resume': {
      if (state.status !== 'paused') return UNCHANGED(state);
      return {
        state: changedTo(state, { ...state, status: 'running', runningSince: now }),
        changed: true,
        events: [],
      };
    }

    case 'stop': {
      if (state.status === 'idle') return UNCHANGED(state);
      let sessionToRecord: FocusSession | undefined;
      if (state.phase === 'focus') {
        const actualMs = Math.min(elapsedMs(state, now), state.plannedMs);
        if (actualMs >= MIN_RECORD_MS) {
          sessionToRecord = buildSession(state, now, actualMs, false);
        }
      }
      return {
        state: idleState(state, { phase: 'focus' }, settings),
        changed: true,
        sessionToRecord,
        events: [],
      };
    }

    case 'skip': {
      if (state.phase === 'focus') return UNCHANGED(state);
      // 긴 휴식을 건너뛰어도 휴식을 마친 것과 같이 세트를 초기화한다.
      const reset = state.phase === 'longBreak' ? { completedFocusInSet: 0 } : {};
      const next = settings.autoStartFocus
        ? runningState(state, 'focus', action.runId, now, settings, reset)
        : idleState(state, { phase: 'focus', ...reset }, settings);
      return { state: next, changed: true, events: [] };
    }

    case 'setTarget': {
      if (state.status !== 'idle' || sameTarget(state.target, action.target)) {
        return UNCHANGED(state);
      }
      return {
        state: changedTo(state, { ...state, target: action.target }),
        changed: true,
        events: [],
      };
    }

    case 'resetSet': {
      if (state.status !== 'idle' || state.completedFocusInSet === 0) return UNCHANGED(state);
      return {
        state: changedTo(state, { ...state, completedFocusInSet: 0 }),
        changed: true,
        events: [],
      };
    }

    case 'complete':
      return complete(state, action, now, settings);
  }
}
