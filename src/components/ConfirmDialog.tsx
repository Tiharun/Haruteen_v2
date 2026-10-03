import { useId, type ReactNode } from 'react';
import { Button } from './Button';
import { Overlay } from './Overlay';
import styles from './Dialog.module.css';

export interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 위험한 동작이면 확인 버튼을 빨강으로 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 브라우저 기본 확인창 대신 쓰는 자체 확인창. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = '취소',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  return (
    <Overlay variant="modal" role="alertdialog" labelledBy={titleId} onClose={onCancel}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </header>
      <div className={styles.body}>{message}</div>
      <footer className={styles.footer}>
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </footer>
    </Overlay>
  );
}
