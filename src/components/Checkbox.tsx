import { useId, type ComponentPropsWithRef } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  label: string;
}

export function Checkbox({ label, id, className, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <input id={inputId} type="checkbox" className={styles.input} {...rest} />
      <span>{label}</span>
    </label>
  );
}
