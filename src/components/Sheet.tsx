import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { Overlay } from './Overlay';
import styles from './Dialog.module.css';

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** 편집 패널. PC·태블릿은 오른쪽 420px, 모바일은 전체 화면. */
export function Sheet({ title, onClose, children, footer }: SheetProps) {
  const titleId = useId();
  return (
    <Overlay variant="sheet" onClose={onClose} labelledBy={titleId}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <IconButton aria-label="닫기" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </Overlay>
  );
}
