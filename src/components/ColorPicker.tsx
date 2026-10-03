import { Check } from 'lucide-react';
import { COLOR_KEYS, type ColorKey } from '../domain/types';
import styles from './ColorPicker.module.css';

const COLOR_NAMES: Record<ColorKey, string> = {
  gray: '회색',
  red: '빨강',
  orange: '주황',
  yellow: '노랑',
  green: '초록',
  teal: '청록',
  blue: '파랑',
  purple: '보라',
};

export interface ColorPickerProps {
  value: ColorKey;
  onChange: (color: ColorKey) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label = '색' }: ColorPickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.group}>
      {COLOR_KEYS.map((key) => {
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={COLOR_NAMES[key]}
            title={COLOR_NAMES[key]}
            className={`${styles.swatch} ${selected ? styles.selected : ''}`}
            style={{ background: `var(--color-${key})` }}
            onClick={() => onChange(key)}
          >
            {/* 색만으로 구분하지 않도록 선택 표시는 체크 아이콘으로 */}
            {selected && <Check size={16} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
