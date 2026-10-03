import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useToast } from '../components/Toast';
import { getTimerState } from '../db/repositories/focus';

const UPDATE_CHECK_MS = 60 * 60 * 1000;
/** 눌러 볼 시간을 주려고 기본(4초)보다 길게 둔다. */
const UPDATE_TOAST_MS = 30_000;

/**
 * 새 버전의 서비스 워커가 준비되면 "새 버전이 있어요" 토스트를 띄운다. (DESIGN.md §9)
 * 타이머는 저장된 시각으로 계산하므로 새로고침해도 이어진다. 그 점을 running일 때 알려 준다.
 */
export function PwaUpdateNotifier() {
  const toast = useToast();

  useEffect(() => {
    let interval: number | undefined;
    const updateSW = registerSW({
      onNeedRefresh() {
        getTimerState()
          .then((timer) => timer.status === 'running')
          .catch(() => false)
          .then((running) => {
            toast.show({
              message: running
                ? '새 버전이 있어요. 타이머는 이어서 진행돼요.'
                : '새 버전이 있어요.',
              durationMs: UPDATE_TOAST_MS,
              action: { label: '새로고침', onClick: () => void updateSW(true) },
            });
          });
      },
      onRegisteredSW(_url, registration) {
        // 오래 켜 둔 탭도 새 버전을 알 수 있게 주기적으로 확인한다.
        if (registration) {
          interval = window.setInterval(() => {
            if (navigator.onLine) registration.update().catch(() => undefined);
          }, UPDATE_CHECK_MS);
        }
      },
    });
    return () => window.clearInterval(interval);
  }, [toast]);

  return null;
}
