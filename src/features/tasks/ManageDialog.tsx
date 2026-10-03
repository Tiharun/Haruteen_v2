import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import {
  countTasksInProject,
  createProject,
  deleteProject,
  updateProject,
} from '../../db/repositories/projects';
import { countTasksWithTag, createTag, deleteTag, updateTag } from '../../db/repositories/tags';
import type { Project, Tag } from '../../domain/types';
import { LIMITS, validateProjectName, validateTagName } from '../../domain/validation';
import { NamedItemEditor } from './NamedItemEditor';

export interface ManageDialogProps {
  projects: Project[];
  tags: Tag[];
  onClose: () => void;
}

/** 프로젝트·태그 관리 대화상자 (DESIGN.md §5.3). */
export function ManageDialog({ projects, tags, onClose }: ManageDialogProps) {
  return (
    <Modal
      title="프로젝트·태그 관리"
      onClose={onClose}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <NamedItemEditor
        heading="프로젝트"
        kind="프로젝트"
        items={projects}
        max={LIMITS.maxProjects}
        defaultColor="blue"
        validateName={validateProjectName}
        onCreate={createProject}
        onUpdate={(id, patch) => updateProject(id, patch)}
        onDelete={(id) => deleteProject(id)}
        countAffected={countTasksInProject}
        impactMessage={(count) =>
          count > 0
            ? `이 프로젝트의 할 일 ${count}개가 “프로젝트 없음”으로 바뀌어요.`
            : '이 프로젝트에 속한 할 일은 없어요.'
        }
      />
      <NamedItemEditor
        heading="태그"
        kind="태그"
        items={tags}
        max={LIMITS.maxTags}
        defaultColor="gray"
        validateName={validateTagName}
        onCreate={createTag}
        onUpdate={(id, patch) => updateTag(id, patch)}
        onDelete={(id) => deleteTag(id)}
        countAffected={countTasksWithTag}
        impactMessage={(count) =>
          count > 0 ? `할 일 ${count}개에서 이 태그가 빠져요.` : '이 태그가 붙은 할 일은 없어요.'
        }
      />
    </Modal>
  );
}
