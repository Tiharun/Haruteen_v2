import { useEffect, useRef, useState, type Ref } from 'react';
import { Button } from '../../components/Button';
import { ColorDot } from '../../components/ColorDot';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import type { DueFilter, StatusFilter, TaskQuery, TaskSort } from '../../domain/tasks';
import type { Project, Tag } from '../../domain/types';
import { DUE_LABEL, SORT_LABEL, STATUS_LABEL } from './labels';
import styles from './FilterBar.module.css';

const STATUSES: StatusFilter[] = ['todo', 'done', 'all'];
const DUES: DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];
const SORTS: TaskSort[] = ['due', 'priority', 'created', 'name'];

export interface FilterBarProps {
  query: TaskQuery;
  projects: Project[];
  tags: Tag[];
  searchRef?: Ref<HTMLInputElement>;
  showReset: boolean;
  /** 검색어를 칠 때는 replace=true로 넘겨 뒤로 가기 기록이 쌓이지 않게 한다. */
  onChange: (patch: Partial<TaskQuery>, replace?: boolean) => void;
  onReset: () => void;
  onManage: () => void;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * 검색창은 입력값을 자기 상태로 들고, 주소(`query.q`)에는 잠깐 쉬었다가 반영한다.
 * 주소를 값으로 직접 쓰면 react-router가 갱신을 Transition으로 처리해서
 * 한글 조합이 깨지거나 빠르게 친 글자가 빠질 수 있다.
 */
function useSearchText(q: string, commit: (q: string) => void) {
  const [text, setText] = useState(q);
  const timer = useRef<number | undefined>(undefined);
  const lastCommitted = useRef(q);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  // 뒤로 가기·필터 초기화처럼 밖에서 검색어가 바뀌면 따라간다. 입력 중에는 건드리지 않는다.
  useEffect(() => {
    if (timer.current !== undefined || q === lastCommitted.current) return;
    lastCommitted.current = q;
    setText(q);
  }, [q]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (value: string) => {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      lastCommitted.current = value;
      commitRef.current(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  /** 필터 초기화: 대기 중인 입력을 버리고 비운다. */
  const clear = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    lastCommitted.current = '';
    setText('');
  };

  return [text, change, clear] as const;
}

export function FilterBar({
  query,
  projects,
  tags,
  searchRef,
  showReset,
  onChange,
  onReset,
  onManage,
}: FilterBarProps) {
  const [searchText, changeSearchText, clearSearchText] = useSearchText(query.q, (q) =>
    onChange({ q }, true),
  );

  const toggleTag = (id: string) => {
    const tagIds = query.tagIds.includes(id)
      ? query.tagIds.filter((t) => t !== id)
      : [...query.tagIds, id];
    onChange({ tagIds });
  };

  return (
    <section aria-label="필터" className={styles.bar}>
      <div className={styles.topRow}>
        <div role="group" aria-label="상태" className={styles.tabs}>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={query.status === status}
              className={`${styles.tab} ${query.status === status ? styles.tabActive : ''}`}
              onClick={() => onChange({ status })}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        <div className={styles.topActions}>
          {showReset && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearSearchText();
                onReset();
              }}
            >
              필터 초기화
            </Button>
          )}
          <Button size="sm" onClick={onManage}>
            관리
          </Button>
        </div>
      </div>

      <div className={styles.controls}>
        <Select
          label="프로젝트"
          value={query.project}
          onChange={(e) => onChange({ project: e.target.value })}
        >
          <option value="all">전체</option>
          <option value="none">프로젝트 없음</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          label="마감"
          value={query.due}
          onChange={(e) => onChange({ due: e.target.value as DueFilter })}
        >
          {DUES.map((due) => (
            <option key={due} value={due}>
              {DUE_LABEL[due]}
            </option>
          ))}
        </Select>
        <Select
          label="정렬"
          value={query.sort}
          onChange={(e) => onChange({ sort: e.target.value as TaskSort })}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABEL[sort]}
            </option>
          ))}
        </Select>
        <Input
          ref={searchRef}
          type="search"
          label="검색"
          placeholder="제목·메모 검색 (/)"
          value={searchText}
          autoComplete="off"
          onChange={(e) => changeSearchText(e.target.value)}
        />
      </div>

      {tags.length > 0 && (
        <div
          role="group"
          aria-label="태그 (여러 개를 고르면 모두 가진 할 일만)"
          className={styles.tags}
        >
          {tags.map((tag) => {
            const on = query.tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={on}
                className={`${styles.tag} ${on ? styles.tagOn : ''}`}
                onClick={() => toggleTag(tag.id)}
              >
                <ColorDot color={tag.color} />
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
