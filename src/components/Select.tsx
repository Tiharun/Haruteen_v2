import { useId, type ComponentPropsWithRef } from 'react';
import styles from './Field.module.css';

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  label: string;
  hint?: string;
  error?: string;
}

export function Select({ label, hint, error, id, className, children, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const descId = `${selectId}-desc`;
  const message = error ?? hint;
  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
      </label>
      <select
        id={selectId}
        className={[styles.control, className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? descId : undefined}
        {...rest}
      >
        {children}
      </select>
      {message && (
        <p id={descId} className={error ? styles.error : styles.hint}>
          {message}
        </p>
      )}
    </div>
  );
}
