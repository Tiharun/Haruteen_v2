import { useLiveQuery } from 'dexie-react-hooks';
import type { ColorKey, ID, Tag } from '../../domain/types';
import { unwrap, validateCanAddTag, validateTagName } from '../../domain/validation';
import { db } from '../db';

export async function createTag(
  name: string,
  color: ColorKey,
  now: number = Date.now(),
): Promise<Tag> {
  return db.transaction('rw', db.tags, async () => {
    const all = await db.tags.toArray();
    unwrap(validateCanAddTag(all.length));
    const tag: Tag = {
      id: crypto.randomUUID(),
      name: unwrap(
        validateTagName(
          name,
          all.map((t) => t.name),
        ),
      ),
      color,
      createdAt: now,
    };
    await db.tags.add(tag);
    return tag;
  });
}

export async function updateTag(
  id: ID,
  patch: Partial<Pick<Tag, 'name' | 'color'>>,
): Promise<Tag | null> {
  return db.transaction('rw', db.tags, async () => {
    const current = await db.tags.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    if (patch.name !== undefined) {
      const others = (await db.tags.toArray()).filter((t) => t.id !== id);
      next.name = unwrap(
        validateTagName(
          patch.name,
          others.map((t) => t.name),
        ),
      );
    }
    await db.tags.put(next);
    return next;
  });
}

export function countTasksWithTag(id: ID): Promise<number> {
  return db.tasks.where('tagIds').equals(id).count();
}

/** 태그를 지우고, 모든 할 일의 tagIds에서 뺀다. 한 트랜잭션. */
export async function deleteTag(id: ID, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.tags, db.tasks, async () => {
    await db.tasks
      .where('tagIds')
      .equals(id)
      .modify((task) => {
        task.tagIds = task.tagIds.filter((tagId) => tagId !== id);
        task.updatedAt = now;
      });
    await db.tags.delete(id);
  });
}

/** 만든 순서대로. tags 테이블에는 createdAt 인덱스가 없어 메모리에서 정렬한다. */
export function useTagsQuery(): Tag[] | undefined {
  return useLiveQuery(async () => {
    const tags = await db.tags.toArray();
    return tags.sort((a, b) => a.createdAt - b.createdAt);
  }, []);
}
