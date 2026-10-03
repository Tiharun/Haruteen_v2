import type { ComponentPropsWithRef } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'aria-label'> {
  /** 아이콘만 있는 버튼이므로 필수 */
  'aria-label': string;
}

export function IconButton({ type = 'button', className, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={[styles.iconButton, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
