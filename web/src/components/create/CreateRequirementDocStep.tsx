import { useState } from 'react';
import { api } from '../../api/client';
import type { Project, Requirement } from '../../types';
import type { WpsDocument } from '../../types/wps';
import { wpsDocumentHref } from '../../types/wps';
import {
  createEmptyRequirementDraft,
  PRIORITY_LABELS,
  REQUIREMENT_TYPE_OPTIONS,
  suggestRequirementCode,
  type RequirementDraft,
} from '../../requirementCreate';
import { REQUIREMENT_STATUS_LABELS } from '../../types';
import { WpsDocumentPickerDialog } from '../wps/WpsDocumentPickerDialog';
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
  const [linkedDoc, setLinkedDoc] = useState<WpsDocument | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);

  const typeLabel =
    REQUIREMENT_TYPE_OPTIONS.find((o) => o.value === draft.requirementType)?.label ?? draft.requirementType;

  const buildDescription = () => {
    const base = draft.description.trim();
    if (!linkedDoc) return base;
    const docLine = `[WPS文档] ${linkedDoc.name}${linkedDoc.link_url ? ` ${linkedDoc.link_url}` : ''}`;
    return base ? `${base}\n\n${docLine}` : docLine;
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const requirement = await api.createRequirement(project.id, {
        requirement_code: suggestRequirementCode(project.project_code, existingRequirementCount),
        title: draft.title.trim(),
        description: buildDescription(),
        priority: draft.priority,
        requirement_type: draft.requirementType,
        acceptance_criteria: draft.acceptanceCriteria.trim(),
        dev_directions: draft.devDirection,
        developer_user_id: draft.devDirection === 'FRONTEND' ? draft.developerUserId : undefined,
        backend_developer_user_id: draft.devDirection === 'BACKEND' ? draft.developerUserId : undefined,
        tester_user_id: draft.testerUserId,
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
          {linkedDoc ? (
            <div className="tsw-createSummaryKv">
              <span className="tsw-muted">关联文档</span>
              <span>{linkedDoc.name}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="tsw-createWizardLayout tsw-createWizardLayoutWide">
      <div className="tsw-createWizardMain">
      <div className="tsw-createForm tsw-createWizardCard tsw-createFormFill">
        <h3 className="tsw-createWizardHeading">需求文档</h3>
        <p className="tsw-createWizardSub tsw-muted">
          可关联 WPS 在线文档作为需求规格说明，也可跳过此步骤稍后补充。
        </p>

        <div className="tsw-docUploadGrid">
          <button type="button" className="tsw-docUploadTile" disabled>
            <span className="tsw-docUploadIcon" aria-hidden="true">☁</span>
            <span>上传本地文档</span>
          </button>
          <button
            type="button"
            className="tsw-docUploadTile"
            onClick={() => setShowDocPicker(true)}
          >
            <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
            <span>关联 WPS 在线文档</span>
          </button>
        </div>

        {linkedDoc ? (
          <div className="tsw-wpsDocCard">
            <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
            <div className="tsw-wpsDocRowText">
              <strong>{linkedDoc.name}</strong>
              <span className="tsw-muted">{linkedDoc.type || '智能文档'}</span>
            </div>
            {wpsDocumentHref(linkedDoc) ? (
              <a className="tsw-linkBtn" href={wpsDocumentHref(linkedDoc)} target="_blank" rel="noreferrer">
                预览
              </a>
            ) : null}
            <button type="button" className="tsw-linkBtn" onClick={() => setLinkedDoc(null)}>
              移除
            </button>
          </div>
        ) : (
          <p className="tsw-fieldHint">尚未关联 WPS 文档，可点击上方按钮从云文档选择。</p>
        )}

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
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">研发方向</span>
            <span>{draft.devDirection === 'BACKEND' ? '后端' : '前端'}</span>
          </div>
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">研发负责人</span>
            <span>{draft.developerUserId ? '已指定' : '未指定'}</span>
          </div>
          <div className="tsw-createSummaryKv">
            <span className="tsw-muted">测试负责人</span>
            <span>{draft.testerUserId ? '已指定' : '未指定'}</span>
          </div>
          {(draft.plannedStart || draft.plannedEnd) ? (
            <div className="tsw-createSummaryKv">
              <span className="tsw-muted">计划周期</span>
              <span>{draft.plannedStart || '—'} ~ {draft.plannedEnd || '—'}</span>
            </div>
          ) : null}
          {linkedDoc ? (
            <div className="tsw-createSummaryKv">
              <span className="tsw-muted">WPS 文档</span>
              <span>{linkedDoc.name}</span>
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
            <li>创建后进入产品设计阶段</li>
            <li>支持关联 WPS 智能文档</li>
            <li>文档信息会写入需求描述</li>
          </ul>
        </div>
      </aside>

      {showDocPicker ? (
        <WpsDocumentPickerDialog
          onClose={() => setShowDocPicker(false)}
          onConfirm={async (doc) => {
            setLinkedDoc(doc);
          }}
        />
      ) : null}
    </div>
  );
}

export function resetRequirementDraft(): RequirementDraft {
  return createEmptyRequirementDraft();
}
