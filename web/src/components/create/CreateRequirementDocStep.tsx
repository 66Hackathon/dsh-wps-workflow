import { useState } from 'react';
import { api } from '../../api/client';
import type { Project, Requirement } from '../../types';
import {
  createEmptyRequirementDraft,
  PRIORITY_LABELS,
  REQUIREMENT_TYPE_OPTIONS,
  suggestRequirementCode,
  type RequirementDraft,
} from '../../requirementCreate';
import { REQUIREMENT_STATUS_LABELS } from '../../types';
import { CreateStepFooter } from './CreateStepFooter';

interface Props {
  project: Project;
  draft: RequirementDraft;
  existingRequirementCount: number;
  onPrev: () => void;
  onCreated: (requirement: Requirement) => void;
}

export function CreateRequirementDocStep({
  project,
  draft,
  existingRequirementCount,
  onPrev,
  onCreated,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Requirement | null>(null);

  const typeLabel =
    REQUIREMENT_TYPE_OPTIONS.find((o) => o.value === draft.requirementType)?.label ?? draft.requirementType;

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const requirement = await api.createRequirement(project.id, {
        requirement_code: suggestRequirementCode(project.project_code, existingRequirementCount),
        title: draft.title.trim(),
        description: draft.description.trim(),
        priority: draft.priority,
        requirement_type: draft.requirementType,
        acceptance_criteria: draft.acceptanceCriteria.trim(),
        product_owner_user_id: draft.productOwnerUserId,
        planned_start_at: draft.plannedStart || undefined,
        planned_end_at: draft.plannedEnd || undefined,
      });
      setCreated(requirement);
      onCreated(requirement);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="tsw-createLaterPanel">
        <div className="tsw-createLaterIcon" aria-hidden="true">✓</div>
        <h3>需求已创建</h3>
        <p className="tsw-muted">
          {created.requirement_code} · {created.title}
        </p>
        <div className="tsw-createLaterSuccess tsw-createSummary">
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">当前状态</span>
            <span>{REQUIREMENT_STATUS_LABELS[created.current_status] ?? created.current_status}</span>
          </div>
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">优先级</span>
            <span>{PRIORITY_LABELS[created.priority] ?? created.priority}</span>
          </div>
        </div>
        <p className="tsw-fieldHint" style={{ marginTop: 16 }}>
          WPS 在线文档关联 Demo 暂未开放，可在「文档」Tab 后续完善。
        </p>
      </div>
    );
  }

  return (
    <div className="tsw-createWizardLayout tsw-createWizardLayoutWide">
      <div className="tsw-createWizardMain">
      <div className="tsw-createForm tsw-createWizardCard tsw-createFormFill">
        <h3 className="tsw-createWizardHeading">需求文档</h3>
        <p className="tsw-createWizardSub tsw-muted">
          可关联 WPS 在线文档作为需求规格说明。Demo 阶段可先跳过，创建后再补充。
        </p>

        <div className="tsw-docUploadGrid">
          <button type="button" className="tsw-docUploadTile" disabled>
            <span className="tsw-docUploadIcon" aria-hidden="true">☁</span>
            <span>上传本地文档</span>
          </button>
          <button type="button" className="tsw-docUploadTile" disabled>
            <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
            <span>关联 WPS 在线文档</span>
          </button>
        </div>
        <p className="tsw-fieldHint">WPS 文档创建与关联能力 Demo 暂未开放。</p>

        <div className="tsw-createSummary" style={{ marginTop: 8 }}>
          <h4>创建摘要</h4>
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">标题</span>
            <span>{draft.title}</span>
          </div>
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">类型</span>
            <span>{typeLabel}</span>
          </div>
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">优先级</span>
            <span>{PRIORITY_LABELS[draft.priority] ?? draft.priority}</span>
          </div>
          {(draft.plannedStart || draft.plannedEnd) ? (
            <div className="tsw-createSummaryKv">
              <span className="tsw-muted">计划周期</span>
              <span>{draft.plannedStart || '—'} ~ {draft.plannedEnd || '—'}</span>
            </div>
          ) : null}
        </div>

        {error ? <p className="tsw-error">{error}</p> : null}

        <CreateStepFooter
          onPrev={onPrev}
          onSkip={() => void handleCreate()}
          skipLabel="跳过并创建"
          onNext={() => void handleCreate()}
          nextLabel="创建需求"
          nextLoading={submitting}
        />
      </div>
      </div>

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard tsw-createAsideCardFill">
          <div className="tsw-createAsideHead">
            <span className="tsw-createAsideCheck" aria-hidden="true">✓</span>
            <strong>即将完成</strong>
          </div>
          <ul className="tsw-createAsideList">
            <li>创建后进入产品编辑阶段</li>
            <li>文档可稍后通过 WPS 关联</li>
            <li>AI 生成文档能力 Demo 暂未开放</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function resetRequirementDraft(): RequirementDraft {
  return createEmptyRequirementDraft();
}
