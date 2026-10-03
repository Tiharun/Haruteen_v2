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
import { createPortal } from 'react-dom';
import { Button } from './Button';
import styles from './Toast.module.css';

const TOAST_MS = 4000;
/** 동작 버튼이 있는 토스트는 키보드로 닿을 시간이 필요해서 더 오래 둔다. */
const ACTION_TOAST_MS = 10_000;

export interface ToastOptions {
  message: string;
  /** 동작 버튼은 1개까지 (DESIGN.md §5.9) */
  action?: { label: string; onClick: () => void };
  /** 화면에 머무는 시간(ms). 기본 4초(동작 버튼이 있으면 10초). 더 길게 둘 알림(새 버전 안내 등)에만 지정한다. */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  // 마우스를 올리거나 포커스가 들어와 있는 동안은 사라지지 않는다 (WCAG 2.2.1).
  const [paused, setPaused] = useState(false);
  const duration = item.durationMs ?? (item.action ? ACTION_TOAST_MS : TOAST_MS);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [item.id, duration, paused, onDismiss]);

  return (
    <div
      className={styles.toast}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span>{item.message}</span>
      {item.action && (
        <Button
          size="sm"
          variant="ghost"
          className={styles.action}
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </Button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show: (options) => {
        const id = nextId.current++;
        setItems((prev) => [...prev.slice(-2), { ...options, id }]);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.region} role="status" aria-live="polite">
          {items.map((item) => (
            <ToastView key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider와 훅을 한 파일에 둔다
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast는 ToastProvider 안에서만 쓸 수 있어요.');
  return api;
}
