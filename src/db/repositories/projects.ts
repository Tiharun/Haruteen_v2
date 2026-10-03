import { useLiveQuery } from 'dexie-react-hooks';
import type { ColorKey, ID, Project } from '../../domain/types';
import { unwrap, validateCanAddProject, validateProjectName } from '../../domain/validation';
import { db } from '../db';

export async function createProject(
  name: string,
  color: ColorKey,
  now: number = Date.now(),
): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const all = await db.projects.toArray();
    unwrap(validateCanAddProject(all.length));
    const project: Project = {
      id: crypto.randomUUID(),
      name: unwrap(
        validateProjectName(
          name,
          all.map((p) => p.name),
        ),
      ),
      color,
      order: all.reduce((max, p) => Math.max(max, p.order), -1) + 1,
      createdAt: now,
    };
    await db.projects.add(project);
    return project;
  });
}

export async function updateProject(
  id: ID,
  patch: Partial<Pick<Project, 'name' | 'color'>>,
): Promise<Project | null> {
  return db.transaction('rw', db.projects, async () => {
    const current = await db.projects.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    if (patch.name !== undefined) {
      const others = (await db.projects.toArray()).filter((p) => p.id !== id);
      next.name = unwrap(
        validateProjectName(
          patch.name,
          others.map((p) => p.name),
        ),
      );
    }
    await db.projects.put(next);
    return next;
  });
}

export function countTasksInProject(id: ID): Promise<number> {
  return db.tasks.where('projectId').equals(id).count();
}

/** 프로젝트를 지우고, 그 프로젝트의 할 일은 '프로젝트 없음'으로 바꾼다. 한 트랜잭션. */
export async function deleteProject(id: ID, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.projects, db.tasks, async () => {
    await db.tasks.where('projectId').equals(id).modify({ projectId: null, updatedAt: now });
    await db.projects.delete(id);
  });
}

export function useProjectsQuery(): Project[] | undefined {
  return useLiveQuery(() => db.projects.orderBy('order').toArray(), []);
}
