import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_TIMER_STATE,
  reduceTimer,
  type TimerAction,
  type TimerEvent,
} from '../../domain/timer';
import type { FocusSession, ID, TimerState } from '../../domain/types';
import { db } from '../db';
import { getSettings } from './kv';

export { DEFAULT_TIMER_STATE };

// ---- 타이머 상태 ----

/** 저장된 타이머 상태. 아직 없으면 기본값(revision 0). */
export async function getTimerState(): Promise<TimerState> {
  const stored = await db.kv.get('timer');
  return stored?.key === 'timer' ? { ...DEFAULT_TIMER_STATE, ...stored } : DEFAULT_TIMER_STATE;
}

/** 타이머 상태를 구독한다. 모든 탭이 같은 값을 본다. 첫 조회 전에는 undefined. */
export function useTimerStateQuery(): TimerState | undefined {
  return useLiveQuery(getTimerState, []);
}

export interface TimerTransition {
  state: TimerState;
  /** 이번 전이로 새로 기록된 세션(있을 때) */
  session?: FocusSession;
  events: TimerEvent[];
}

/**
 * 모든 타이머 전이는 이 함수 하나로 한다. (DESIGN.md §4.4 "여러 탭 동시 사용")
 * 읽기·쓰기·세션 기록이 한 트랜잭션이고, 저장된 revision이 expectedRevision과 다르거나
 * 동작이 현재 상태에서 의미가 없으면 아무것도 쓰지 않고 false를 돌려준다.
 * 소리·알림·토스트는 false가 아닌 결과를 받은 쪽만 낸다.
 */
export async function transitionTimer(
  expectedRevision: number,
  action: TimerAction,
  now: number = Date.now(),
): Promise<TimerTransition | false> {
  return db.transaction('rw', db.kv, db.focusSessions, async () => {
    const current = await getTimerState();
    if (current.revision !== expectedRevision) return false;

    const settings = await getSettings();
    const result = reduceTimer(current, action, now, settings);
    if (!result.changed) return false;

    await db.kv.put(result.state);
    if (result.sessionToRecord) await db.focusSessions.put(result.sessionToRecord);
    return { state: result.state, session: result.sessionToRecord, events: result.events };
  });
}

// ---- 집중 세션 조회 ----

function byStartedAtDesc(a: FocusSession, b: FocusSession): number {
  return b.startedAt - a.startedAt;
}

/** startedAt이 [from, to)에 속한 세션, 최신순. */
export async function listSessionsBetween(from: number, to: number): Promise<FocusSession[]> {
  const sessions = await db.focusSessions
    .where('startedAt')
    .between(from, to, true, false)
    .toArray();
  return sessions.sort(byStartedAtDesc);
}

/** 한 대상(할 일·습관)의 세션, 최신순. */
export async function listSessionsByTarget(targetId: ID): Promise<FocusSession[]> {
  const sessions = await db.focusSessions.where('targetId').equals(targetId).toArray();
  return sessions.sort(byStartedAtDesc);
}

/** 대상별 누적 집중 시간(actualMs 합계). 대상 없는 세션은 제외. */
export async function sumFocusByTarget(): Promise<Map<ID, number>> {
  const totals = new Map<ID, number>();
  await db.focusSessions.each((session) => {
    if (session.targetId === null) return;
    totals.set(session.targetId, (totals.get(session.targetId) ?? 0) + session.actualMs);
  });
  return totals;
}

export function useSessionsBetween(from: number, to: number): FocusSession[] | undefined {
  return useLiveQuery(() => listSessionsBetween(from, to), [from, to]);
}

export function useTargetSessions(targetId: ID): FocusSession[] | undefined {
  return useLiveQuery(() => listSessionsByTarget(targetId), [targetId]);
}

/** 대상별 누적 집중 시간. 첫 조회 전에는 undefined. */
export function useFocusTotals(): Map<ID, number> | undefined {
  return useLiveQuery(sumFocusByTarget, []);
}
