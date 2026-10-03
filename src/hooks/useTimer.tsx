import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../components/Toast';
import { APP_NAME } from '../config';
import { todayOf } from '../domain/dates';
import {
  DEFAULT_TIMER_STATE,
  displayPlannedMs,
  documentTitle,
  endsAt,
  formatDuration,
  isDue,
  PHASE_LABEL,
  remainingMs,
  type TimerAction,
  type TimerEvent,
} from '../domain/timer';
import { ValidationError } from '../domain/validation';
import type { FocusTarget, Settings, TimerState } from '../domain/types';
import {
  transitionTimer,
  useTimerStateQuery,
  type TimerTransition,
} from '../db/repositories/focus';
import { recordHabitProgress } from '../db/repositories/habitLogs';
import { playBeeps, primeAudio, showSystemNotification } from './timerAlerts';
import { useSettings } from './useSettings';

/** 숨겨진 탭에서 끝난 단계를 보이는 탭에 알리는 채널 */
const COMPLETION_CHANNEL = 'haruteen-timer-completed';
const TICK_MS = 250;
/** setTimeout이 완료 시각보다 아주 조금 일찍 깨어나는 경우를 피하려는 여유 */
const DUE_MARGIN_MS = 20;

export interface TimerApi {
  /** 저장된 타이머 상태와 설정을 모두 읽었는지. false인 동안은 동작이 무시된다. */
  ready: boolean;
  state: TimerState;
  settings: Settings;
  /** 250ms마다 갱신되는 현재 시각 */
  now: number;
  /** 지금 단계의 총 길이 */
  plannedMs: number;
  /** 지금 단계의 남은 시간(idle이면 설정값 전체) */
  remainingMs: number;
  /** target을 생략하면 대기 중인 단계를 그대로 시작, 넘기면 그 대상으로 집중 시작(null = 대상 없음) */
  start: (options?: { target?: FocusTarget }) => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  skip: () => Promise<boolean>;
  setTarget: (target: FocusTarget) => Promise<boolean>;
  resetSet: () => Promise<boolean>;
}

const TimerContext = createContext<TimerApi | null>(null);

function completionMessage(event: TimerEvent): string {
  if (event.restored) {
    return event.phase === 'focus'
      ? `자리를 비운 사이 집중이 끝났어요 (${formatDuration(event.actualMs)} 기록됨)`
      : '자리를 비운 사이 휴식이 끝났어요';
  }
  if (event.phase === 'focus') {
    const done = `집중이 끝났어요! (${formatDuration(event.actualMs)})`;
    return event.autoStarted
      ? `${done} ${PHASE_LABEL[event.nextPhase]}을 시작해요.`
      : `${done} 다음은 ${PHASE_LABEL[event.nextPhase]}이에요.`;
  }
  return event.autoStarted
    ? '휴식이 끝났어요. 집중을 시작해요.'
    : '휴식이 끝났어요. 다시 집중해 볼까요?';
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { settings, ready: settingsReady } = useSettings();
  const stored = useTimerStateQuery();
  const state = stored ?? DEFAULT_TIMER_STATE;
  const ready = stored !== undefined && settingsReady;

  const [now, setNow] = useState(() => Date.now());

  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  const readyRef = useRef(ready);
  useEffect(() => {
    stateRef.current = state;
    settingsRef.current = settings;
    readyRef.current = ready;
  });

  const showCompletionToast = useCallback(
    (event: TimerEvent) => {
      const habit = event.phase === 'focus' && event.target?.type === 'habit' ? event.target : null;
      toast.show({
        message: completionMessage(event),
        action: habit
          ? {
              label: '습관도 체크할까요?',
              onClick: () => {
                const today = todayOf(Date.now(), settingsRef.current.dayStartHour);
                recordHabitProgress(habit.id, today).then(
                  (log) =>
                    toast.show({
                      message:
                        log === null
                          ? '습관을 찾을 수 없어요.'
                          : `“${habit.titleSnapshot}” 습관을 기록했어요.`,
                    }),
                  (error: unknown) =>
                    toast.show({
                      message:
                        error instanceof ValidationError
                          ? error.message
                          : '습관을 기록하지 못했어요.',
                    }),
                );
              },
            }
          : undefined,
      });
    },
    [toast],
  );

  // 전이에 성공한 탭이 숨겨져 있으면 사용자가 보고 있는 다른 탭에 토스트를 대신 띄워 달라고 알린다.
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(COMPLETION_CHANNEL);
    channel.onmessage = (message: MessageEvent<TimerEvent>) => {
      if (!document.hidden) showCompletionToast(message.data);
    };
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [showCompletionToast]);

  /** 전이에 성공한 이 탭만 소리·알림·토스트를 낸다. */
  const announce = useCallback(
    (transition: TimerTransition) => {
      for (const event of transition.events) {
        const current = settingsRef.current;
        if (!event.restored) {
          if (current.soundEnabled) playBeeps(current.soundVolume);
          if (current.notificationsEnabled) {
            showSystemNotification(APP_NAME, completionMessage(event));
          }
        }
        showCompletionToast(event);
        if (document.hidden) channelRef.current?.postMessage(event);
      }
    },
    [showCompletionToast],
  );

  const act = useCallback(
    async (action: TimerAction): Promise<boolean> => {
      if (!readyRef.current) return false;
      const result = await transitionTimer(stateRef.current.revision, action);
      if (result === false) return false;
      announce(result);
      return true;
    },
    [announce],
  );

  // ---- 완료 감지 ----

  const completing = useRef<string | null>(null);
  const tryComplete = useCallback(
    async (restored: boolean) => {
      const current = stateRef.current;
      if (!readyRef.current || !isDue(current, Date.now())) return;
      const key = `${current.runId}:${current.revision}`;
      if (completing.current === key) return;
      completing.current = key;
      try {
        await act({ type: 'complete', nextRunId: crypto.randomUUID(), restored });
      } catch {
        completing.current = null; // 저장소 오류면 다음 틱에 다시 시도한다
      }
    },
    [act],
  );

  // 앱을 열었을 때 이미 끝나 있던 단계는 "자리를 비운 사이" 복원으로 처리한다(DESIGN.md §4.4).
  const restoredChecked = useRef(false);
  useEffect(() => {
    if (!ready || restoredChecked.current) return;
    restoredChecked.current = true;
    void tryComplete(true);
  }, [ready, tryComplete]);

  // 완료 시각에 맞춘 setTimeout
  const { status, runId, revision } = state;
  useEffect(() => {
    if (!ready || status !== 'running') return;
    const current = stateRef.current;
    const end = endsAt(current);
    if (end === null) return;
    let timer: number | undefined;
    const arm = () => {
      const wait = end - Date.now() + DUE_MARGIN_MS;
      timer = window.setTimeout(
        () => {
          if (isDue(stateRef.current, Date.now())) void tryComplete(false);
          else arm();
        },
        Math.max(0, wait),
      );
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [ready, status, runId, revision, tryComplete]);

  // 250ms 화면 갱신 + 보이게 되는 즉시 재계산
  useEffect(() => {
    const refresh = () => {
      const t = Date.now();
      setNow(t);
      if (isDue(stateRef.current, t)) void tryComplete(false);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    const interval = status === 'running' ? window.setInterval(refresh, TICK_MS) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [status, runId, revision, tryComplete]);

  // 탭 제목
  const showTimerInTitle = settings.showTimerInTitle;
  useEffect(() => {
    const title = ready ? documentTitle(state, now, APP_NAME, showTimerInTitle) : APP_NAME;
    if (document.title !== title) document.title = title;
  }, [ready, state, now, showTimerInTitle]);
  useEffect(
    () => () => {
      document.title = APP_NAME;
    },
    [],
  );

  // 진행 중에 새로고침하고 버튼을 한 번도 누르지 않았어도 완료 소리가 나도록, 첫 클릭·키 입력 때 오디오를 깨워 둔다.
  const needsAudio = settings.soundEnabled && state.status !== 'idle';
  useEffect(() => {
    if (!needsAudio) return undefined;
    const events = ['pointerdown', 'keydown'] as const;
    const prime = () => {
      primeAudio();
      for (const name of events) document.removeEventListener(name, prime, true);
    };
    for (const name of events) document.addEventListener(name, prime, true);
    return () => {
      for (const name of events) document.removeEventListener(name, prime, true);
    };
  }, [needsAudio]);

  // ---- 동작 ----

  const start = useCallback(
    async (options?: { target?: FocusTarget }) => {
      primeAudio(); // 사용자 동작 안에서 오디오를 깨워 둔다
      return act({ type: 'start', runId: crypto.randomUUID(), target: options?.target });
    },
    [act],
  );
  const pause = useCallback(() => act({ type: 'pause' }), [act]);
  const resume = useCallback(() => {
    primeAudio();
    return act({ type: 'resume' });
  }, [act]);
  const stop = useCallback(() => act({ type: 'stop' }), [act]);
  const skip = useCallback(() => {
    primeAudio();
    return act({ type: 'skip', runId: crypto.randomUUID() });
  }, [act]);
  const setTarget = useCallback((target: FocusTarget) => act({ type: 'setTarget', target }), [act]);
  const resetSet = useCallback(() => act({ type: 'resetSet' }), [act]);

  const value = useMemo<TimerApi>(
    () => ({
      ready,
      state,
      settings,
      now,
      plannedMs: displayPlannedMs(state, settings),
      remainingMs: remainingMs(state, now, settings),
      start,
      pause,
      resume,
      stop,
      skip,
      setTarget,
      resetSet,
    }),
    [ready, state, settings, now, start, pause, resume, stop, skip, setTarget, resetSet],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider와 훅을 한 파일에 둔다
export function useTimer(): TimerApi {
  const api = useContext(TimerContext);
  if (!api) throw new Error('useTimer는 TimerProvider 안에서만 쓸 수 있어요.');
  return api;
}

/**
 * "이 대상으로 집중 시작" (▶ 버튼). 타이머가 비어 있으면 시작하고 집중 화면으로 이동한다.
 * 이미 진행 중이면 덮어쓰지 않고 안내만 한다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Provider와 훅을 한 파일에 둔다
export function useStartFocus(): (target: NonNullable<FocusTarget>) => Promise<void> {
  const timer = useTimer();
  const navigate = useNavigate();
  const toast = useToast();
  const { start } = timer;
  const status = timer.state.status;

  return useCallback(
    async (target) => {
      if (status !== 'idle') {
        toast.show({
          message: '이미 진행 중인 타이머가 있어요.',
          action: { label: '집중 화면', onClick: () => void navigate('/focus') },
        });
        return;
      }
      if (await start({ target })) void navigate('/focus');
    },
    [status, start, toast, navigate],
  );
}
