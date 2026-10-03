import { useId, type ComponentPropsWithRef } from 'react';
import styles from './Field.module.css';

export interface InputProps extends ComponentPropsWithRef<'input'> {
  label: string;
  hint?: string;
  /** 검증 실패 이유. 있으면 입력 아래에 표시한다(DESIGN.md §3.7). */
  error?: string;
}

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;
  const message = error ?? hint;
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <input
        id={inputId}
        className={[styles.control, className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? descId : undefined}
        {...rest}
      />
      {message && (
        <p id={descId} className={error ? styles.error : styles.hint}>
          {message}
        </p>
      )}
    </div>
  );
}
