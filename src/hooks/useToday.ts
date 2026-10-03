import { useEffect, useState } from 'react';
import { nextDayBoundary, todayOf } from '../domain/dates';
import type { LocalDate } from '../domain/types';

/**
 * 현재 "오늘" 날짜. 다음 날짜 경계 시각에 다시 계산하고,
 * 탭이 다시 보일 때(visibilitychange)도 다시 계산한다. (DESIGN.md §4.1)
 */
export function useToday(dayStartHour: number): LocalDate {
  const [today, setToday] = useState<LocalDate>(() => todayOf(Date.now(), dayStartHour));

  useEffect(() => {
    let timer: number | undefined;

    const refresh = () => {
      const now = Date.now();
      setToday(todayOf(now, dayStartHour));
      window.clearTimeout(timer);
      // setTimeout 최댓값(약 24.8일)보다 항상 짧다. 절전 등으로 늦게 깨어나도 refresh가 다시 계산한다.
      timer = window.setTimeout(refresh, Math.max(1000, nextDayBoundary(now, dayStartHour) - now));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dayStartHour]);

  return today;
}
