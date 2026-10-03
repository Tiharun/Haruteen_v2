import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Overlay.module.css';

// 겹친 오버레이(예: 시트 위의 확인창)에서는 맨 위 것만 Esc·Tab에 반응한다.
const stack: symbol[] = [];

/** 사라진 요소 대신 포커스를 돌려줄지 확인하기까지 기다리는 시간(목록이 다시 그려질 틈) */
const FOCUS_RESTORE_MS = 150;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface OverlayProps {
  onClose: () => void;
  labelledBy: string;
  variant: 'modal' | 'sheet';
  children: ReactNode;
  role?: 'dialog' | 'alertdialog';
}

/** 포커스 가두기, Esc 닫기, 스크롤 잠금, 닫을 때 포커스 복원을 담당하는 공통 바탕. */
export function Overlay({ onClose, labelledBy, variant, children, role = 'dialog' }: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const token = Symbol('overlay');
    stack.push(token);
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0] ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        panel.focus();
      } else if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
      // 열 때 누른 버튼이 그사이 사라졌으면(할 일 삭제 등) 포커스가 body로 빠진다. 본문으로 대신 돌려준다.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        const main = document.querySelector<HTMLElement>('main');
        if (!main) return;
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }, FOCUS_RESTORE_MS);
    };
  }, []);

  return createPortal(
    <div
      className={`${styles.backdrop} ${styles[variant]}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={styles.panel}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
