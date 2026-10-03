import { useState, type Ref } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { validateTaskTitle } from '../../domain/validation';
import styles from './QuickAdd.module.css';

export interface QuickAddProps {
  inputRef?: Ref<HTMLInputElement>;
  /** 저장에 성공하면 입력창을 비운다. 실패하면 던져서 입력을 남긴다. */
  onAdd: (title: string) => Promise<void>;
}

export function QuickAdd({ inputRef, onAdd }: QuickAddProps) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const result = validateTaskTitle(title);
  // 아직 아무것도 안 쓴 상태에서는 이유를 보여 주지 않는다. 공백만 쓰면 이유를 보여 준다.
  const error = title !== '' && !result.ok ? result.error : undefined;

  const submit = async () => {
    if (!result.ok || busy) return;
    setBusy(true);
    try {
      await onAdd(result.value);
      setTitle('');
    } catch {
      // 오류 안내는 onAdd 쪽에서 한다. 입력은 그대로 둔다.
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className={styles.input}>
        <Input
          ref={inputRef}
          label="새 할 일"
          placeholder="할 일을 입력하고 Enter (N)"
          value={title}
          error={error}
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <Button type="submit" variant="primary" disabled={!result.ok || busy} className={styles.add}>
        <Plus size={16} aria-hidden="true" />
        추가
      </Button>
    </form>
  );
}
