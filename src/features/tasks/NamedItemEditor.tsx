import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { ColorDot } from '../../components/ColorDot';
import { ColorPicker } from '../../components/ColorPicker';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import type { ColorKey, ID } from '../../domain/types';
import { ValidationError, type Validated } from '../../domain/validation';
import styles from './NamedItemEditor.module.css';

export interface NamedItem {
  id: ID;
  name: string;
  color: ColorKey;
}

export interface NamedItemEditorProps {
  heading: string;
  /** 오류 문구에 쓰는 이름: '프로젝트' | '태그' */
  kind: string;
  items: NamedItem[];
  max: number;
  defaultColor: ColorKey;
  validateName: (raw: string, otherNames: string[]) => Validated<string>;
  onCreate: (name: string, color: ColorKey) => Promise<unknown>;
  onUpdate: (id: ID, patch: { name: string; color: ColorKey }) => Promise<unknown>;
  onDelete: (id: ID) => Promise<void>;
  /** 삭제하면 영향을 받는 할 일 수 */
  countAffected: (id: ID) => Promise<number>;
  impactMessage: (count: number) => string;
}

export function NamedItemEditor({
  heading,
  kind,
  items,
  max,
  defaultColor,
  validateName,
  onCreate,
  onUpdate,
  onDelete,
  countAffected,
  impactMessage,
}: NamedItemEditorProps) {
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<ColorKey>(defaultColor);
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<ColorKey>(defaultColor);
  const [removing, setRemoving] = useState<{ item: NamedItem; count: number } | null>(null);

  const namesExcept = (id: ID | null) => items.filter((i) => i.id !== id).map((i) => i.name);

  const newCheck = validateName(newName, namesExcept(null));
  const atLimit = items.length >= max;
  const newError = newName !== '' && !newCheck.ok ? newCheck.error : undefined;

  const editCheck = validateName(editName, namesExcept(editingId));

  const run = async (action: () => Promise<unknown>, failMessage: string) => {
    try {
      await action();
      return true;
    } catch (error) {
      toast.show({ message: error instanceof ValidationError ? error.message : failMessage });
      return false;
    }
  };

  const create = async () => {
    if (!newCheck.ok || atLimit) return;
    if (await run(() => onCreate(newName, newColor), `${kind}을(를) 만들지 못했어요.`)) {
      setNewName('');
    }
  };

  const saveEdit = async () => {
    if (editingId === null || !editCheck.ok) return;
    if (
      await run(
        () => onUpdate(editingId, { name: editName, color: editColor }),
        `${kind}을(를) 저장하지 못했어요.`,
      )
    ) {
      setEditingId(null);
    }
  };

  const askRemove = async (item: NamedItem) => {
    try {
      setRemoving({ item, count: await countAffected(item.id) });
    } catch {
      toast.show({ message: '영향받는 할 일 수를 확인하지 못했어요.' });
    }
  };

  return (
    <section className={styles.section} aria-label={heading}>
      <h3 className={styles.heading}>
        {heading} ({items.length}/{max})
      </h3>

      {items.length === 0 && <p className={styles.empty}>아직 없어요.</p>}
      <ul className={styles.list}>
        {items.map((item) =>
          editingId === item.id ? (
            <li key={item.id} className={styles.editRow}>
              <Input
                label={`${kind} 이름`}
                value={editName}
                error={editCheck.ok ? undefined : editCheck.error}
                onChange={(e) => setEditName(e.target.value)}
              />
              <ColorPicker value={editColor} onChange={setEditColor} label={`${kind} 색`} />
              <div className={styles.editActions}>
                <Button size="sm" onClick={() => setEditingId(null)}>
                  취소
                </Button>
                <Button size="sm" variant="primary" disabled={!editCheck.ok} onClick={saveEdit}>
                  저장
                </Button>
              </div>
            </li>
          ) : (
            <li key={item.id} className={styles.row}>
              <ColorDot color={item.color} />
              <span className={styles.name}>{item.name}</span>
              <IconButton
                aria-label={`${item.name} 수정`}
                onClick={() => {
                  setEditingId(item.id);
                  setEditName(item.name);
                  setEditColor(item.color);
                }}
              >
                <Pencil size={16} aria-hidden="true" />
              </IconButton>
              <IconButton aria-label={`${item.name} 삭제`} onClick={() => void askRemove(item)}>
                <Trash2 size={16} aria-hidden="true" />
              </IconButton>
            </li>
          ),
        )}
      </ul>

      <form
        className={styles.add}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input
          label={`새 ${kind} 이름`}
          value={newName}
          disabled={atLimit}
          hint={atLimit ? `${kind}는 ${max}개까지 만들 수 있어요.` : undefined}
          error={newError}
          onChange={(e) => setNewName(e.target.value)}
        />
        <ColorPicker value={newColor} onChange={setNewColor} label={`새 ${kind} 색`} />
        <Button type="submit" variant="primary" disabled={!newCheck.ok || atLimit}>
          {kind} 추가
        </Button>
      </form>

      {removing && (
        <ConfirmDialog
          title={`${kind}를 삭제할까요?`}
          message={
            <>
              <p>“{removing.item.name}”을(를) 삭제해요.</p>
              <p className={styles.impact}>{impactMessage(removing.count)}</p>
            </>
          }
          confirmLabel="삭제"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const { item } = removing;
            setRemoving(null);
            void run(() => onDelete(item.id), `${kind}를 삭제하지 못했어요.`);
          }}
        />
      )}
    </section>
  );
}
