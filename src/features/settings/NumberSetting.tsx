import { useState } from 'react';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import {
  validateTimerSettingText,
  ValidationError,
  type TimerSettingKey,
} from '../../domain/validation';

export interface NumberSettingProps {
  settingKey: TimerSettingKey;
  label: string;
  unit: string;
  value: number;
  onSave: (value: number) => Promise<void>;
}

/**
 * 숫자 설정 입력. 입력 중에는 검사만 해서 이유를 입력 아래에 보여 주고(DESIGN.md §3.7),
 * 칸을 벗어나거나 Enter를 누를 때 범위 안의 정수면 저장한다. 입력 도중의 "1", "12" 같은 값이 저장되지 않게 하려는 것이다.
 */
export function NumberSetting({ settingKey, label, unit, value, onSave }: NumberSettingProps) {
  const toast = useToast();
  const [text, setText] = useState(String(value));
  // 저장된 값이 밖에서 바뀌면(백업 불러오기 등) 입력칸도 맞춘다.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setText(String(value));
  }
  const check = validateTimerSettingText(settingKey, text);

  const commit = () => {
    if (!check.ok || check.value === value) return;
    onSave(check.value).catch((error: unknown) =>
      toast.show({
        message: error instanceof ValidationError ? error.message : '저장하지 못했어요.',
      }),
    );
  };

  return (
    <Input
      label={`${label} (${unit})`}
      inputMode="numeric"
      value={text}
      error={check.ok ? undefined : check.error}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
