import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import styles from './useShortcut.module.css';

/**
 * 키보드 단축키 (DESIGN.md §5.9). 화면이 useShortcut으로 자기 동작만 등록하고,
 * `?` 도움말은 등록된 목록을 그대로 보여 준다.
 */
export interface ShortcutDef {
  /** 도움말에 보여 줄 키 이름 */
  keys: string;
  /** KeyboardEvent.code. 한글 입력 상태에서도 동작하도록 key가 아니라 code로 비교한다. */
  code: string;
  shift?: boolean;
  description: string;
  /** 없으면 도움말에만 나온다(이미 다른 곳에서 처리하는 동작, 예: Esc). */
  handler?: () => void;
}

interface Registry {
  register: (def: ShortcutDef) => () => void;
}

const noopRegistry: Registry = { register: () => () => undefined };
const ShortcutContext = createContext<Registry>(noopRegistry);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/** 버튼·링크 등은 Space로 눌리므로, 포커스가 거기 있을 때 Space 단축키까지 동작하면 두 번 실행된다. */
function isActivatable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLButtonElement ||
      target instanceof HTMLAnchorElement ||
      target.tagName === 'SUMMARY' ||
      target.getAttribute('role') === 'button')
  );
}

/** `?` 도움말에 보여 줄 전체 단축키(DESIGN.md §5.9). 어느 화면에 있든 같은 목록을 보여 준다. */
const HELP_ROWS: { keys: string; description: string }[] = [
  { keys: 'N', description: '새 할 일 입력창으로 이동 (오늘·할 일 화면)' },
  { keys: '/', description: '검색창으로 이동 (할 일 화면)' },
  { keys: 'Space', description: '타이머 시작·일시정지 (집중 화면)' },
  { keys: 'Esc', description: '열린 패널·대화상자 닫기' },
  { keys: '?', description: '단축키 도움말' },
];

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [defs, setDefs] = useState<ShortcutDef[]>([]);
  const defsRef = useRef(defs);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    defsRef.current = defs;
  });

  const register = useCallback((def: ShortcutDef) => {
    setDefs((prev) => [...prev, def]);
    return () => setDefs((prev) => prev.filter((d) => d !== def));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      // 입력 중이거나 열린 대화상자·패널이 있으면 Esc 외에는 동작하지 않는다.
      if (isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]')) return;
      if (e.code === 'Space' && isActivatable(e.target)) return;

      if (e.code === 'Slash' && e.shiftKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      const def = defsRef.current.find(
        (d) => d.handler && d.code === e.code && (d.shift ?? false) === e.shiftKey,
      );
      if (def) {
        e.preventDefault();
        def.handler?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ShortcutContext.Provider value={{ register }}>
      {children}
      {helpOpen && (
        <Modal
          title="키보드 단축키"
          onClose={() => setHelpOpen(false)}
          footer={<Button onClick={() => setHelpOpen(false)}>닫기</Button>}
        >
          <dl className={styles.list}>
            {HELP_ROWS.map((row) => (
              <div key={`${row.keys}-${row.description}`} className={styles.row}>
                <dt>
                  <kbd className={styles.key}>{row.keys}</kbd>
                </dt>
                <dd>{row.description}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.note}>입력창에 커서가 있을 때는 Esc 외에는 동작하지 않아요.</p>
        </Modal>
      )}
    </ShortcutContext.Provider>
  );
}

/** 화면이 열려 있는 동안만 단축키를 등록한다. Provider 밖(테스트 등)에서는 아무 일도 하지 않는다. */
// eslint-disable-next-line react-refresh/only-export-components -- Provider와 훅을 한 파일에 둔다
export function useShortcut(def: ShortcutDef): void {
  const { register } = useContext(ShortcutContext);
  const handlerRef = useRef(def.handler);
  useEffect(() => {
    handlerRef.current = def.handler;
  });
  const { keys, code, shift, description } = def;
  const hasHandler = def.handler !== undefined;
  useEffect(
    () =>
      register({
        keys,
        code,
        shift,
        description,
        handler: hasHandler ? () => handlerRef.current?.() : undefined,
      }),
    [register, keys, code, shift, description, hasHandler],
  );
}
