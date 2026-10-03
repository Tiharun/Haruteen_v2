import { useId, useState, type ReactNode } from 'react';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  text: string;
  children: ReactNode;
}

/** 마우스를 올리거나 포커스가 들어오면 설명을 보여 준다. */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={styles.wrapper}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span role="tooltip" id={id} className={styles.tip}>
          {text}
        </span>
      )}
    </span>
  );
}
