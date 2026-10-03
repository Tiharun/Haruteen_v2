import { useLocation } from 'react-router';
import { useTimer } from '../../hooks/useTimer';

/** 모바일에서 탭 바 위에 미니 타이머 바를 보여 줄지. 타이머가 동작 중(진행·일시정지)이고 집중 화면이 아닐 때. */
export function useMiniBarVisible(): boolean {
  const { state } = useTimer();
  const { pathname } = useLocation();
  return state.status !== 'idle' && pathname !== '/focus';
}
