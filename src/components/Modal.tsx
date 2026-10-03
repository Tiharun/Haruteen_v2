import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { Overlay } from './Overlay';
import styles from './Dialog.module.css';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
  const titleId = useId();
  return (
    <Overlay variant="modal" onClose={onClose} labelledBy={titleId}>
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
