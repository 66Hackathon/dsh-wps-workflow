import { userDisplayName } from '../memberRoles';
import {
  REQUIREMENT_PHASE_BADGE,
  REQUIREMENT_PHASE_STEPS,
  REQUIREMENT_STEP_ENTRY_STATUS,
  requirementStepStageCode,
  type RequirementPhaseStep,
} from '../requirementPhase';
import type {
  ProjectMember,
  Requirement,
  RequirementStageSubmission,
  RequirementTimeline,
  StatusChangeLogEntry,
} from '../types';

interface Props {
  step: RequirementPhaseStep;
  requirement: Requirement;
  members: ProjectMember[];
  timeline: RequirementTimeline | null;
  loading: boolean;
  error: string | null;
}

function memberName(members: ProjectMember[], userId?: number): string {
  if (!userId) return '—';
  const member = members.find((m) => m.user_id === userId);
  return member ? userDisplayName(member.user_name) : `用户 #${userId}`;
}

function formatTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function submissionForStep(
  timeline: RequirementTimeline | null,
  stepId: string,
): RequirementStageSubmission | null {
  if (!timeline) return null;
  const stageCode = requirementStepStageCode(stepId);
  if (!stageCode) return null;
  return timeline.stage_submissions.find((item) => item.stage_code === stageCode) ?? null;
}

function statusChangesForStep(
  timeline: RequirementTimeline | null,
  stepId: string,
): StatusChangeLogEntry[] {
  if (!timeline) return [];
  const entryStatus = REQUIREMENT_STEP_ENTRY_STATUS[stepId];
  if (!entryStatus) return [];
  return timeline.status_changes.filter(
    (item) => item.to_status === entryStatus || item.from_status === entryStatus,
  );
}

function HistoryField({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="tsw-reqHistoryField">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ProductDesignHistory({
  submission,
  ownerName,
}: {
  submission: RequirementStageSubmission | null;
  ownerName: string;
}) {
  if (!submission) {
    return <p className="tsw-muted">该节点尚未提交阶段材料。</p>;
  }
  return (
    <dl className="tsw-reqHistoryFields">
      <HistoryField label="产品负责人" value={ownerName} />
      <HistoryField label="需求规格" value={submission.spec_body} />
      <HistoryField label="验收标准" value={submission.acceptance_criteria} />
      <HistoryField label="提交人" value={submission.operator_name} />
      <HistoryField label="提交时间" value={formatTime(submission.submitted_at)} />
    </dl>
  );
}

function DevAssignHistory({
  submission,
  requirement,
  members,
}: {
  submission: RequirementStageSubmission | null;
  requirement: Requirement;
  members: ProjectMember[];
}) {
  if (!submission) {
    return <p className="tsw-muted">该节点尚未提交阶段材料。</p>;
  }
  const reviewLabel = submission.review_result === 'APPROVED'
    ? '通过'
    : submission.review_result === 'REJECTED'
      ? '驳回'
      : submission.review_result;
  return (
    <dl className="tsw-reqHistoryFields">
      <HistoryField label="评审结论" value={reviewLabel} />
      <HistoryField label="评审说明" value={submission.review_comment} />
      <HistoryField label="评审人" value={memberName(members, submission.reviewer_user_id)} />
      {submission.review_result === 'APPROVED' ? (
        <>
          <HistoryField label="前端负责人" value={memberName(members, requirement.developer_user_id)} />
          <HistoryField label="后端负责人" value={memberName(members, requirement.backend_developer_user_id)} />
          <HistoryField label="测试负责人" value={memberName(members, requirement.tester_user_id)} />
        </>
      ) : null}
      <HistoryField label="提交人" value={submission.operator_name} />
      <HistoryField label="提交时间" value={formatTime(submission.submitted_at)} />
    </dl>
  );
}

function DevelopmentHistory({ submission }: { submission: RequirementStageSubmission | null }) {
  if (!submission) {
    return <p className="tsw-muted">该节点尚未提交阶段材料。</p>;
  }
  return (
    <dl className="tsw-reqHistoryFields">
      <HistoryField label="研发摘要" value={submission.dev_summary} />
      <HistoryField label="实现说明" value={submission.implementation_notes} />
      <HistoryField label="提交人" value={submission.operator_name} />
      <HistoryField label="提交时间" value={formatTime(submission.submitted_at)} />
    </dl>
  );
}

function TestingHistory({
  submission,
  members,
}: {
  submission: RequirementStageSubmission | null;
  members: ProjectMember[];
}) {
  if (!submission) {
    return <p className="tsw-muted">该节点尚未提交阶段材料。</p>;
  }
  return (
    <dl className="tsw-reqHistoryFields">
      <HistoryField label="测试负责人" value={memberName(members, submission.tester_user_id)} />
      <HistoryField label="测试结论" value={submission.test_result} />
      <HistoryField label="测试摘要" value={submission.test_summary} />
      <HistoryField label="覆盖用例" value={submission.test_cases_covered} />
      <HistoryField label="提交人" value={submission.operator_name} />
      <HistoryField label="提交时间" value={formatTime(submission.submitted_at)} />
    </dl>
  );
}

function AcceptanceHistory({ submission }: { submission: RequirementStageSubmission | null }) {
  if (!submission) {
    return <p className="tsw-muted">该节点尚未提交阶段材料。</p>;
  }
  const resultLabel = submission.review_result === 'APPROVED'
    ? '验收通过'
    : submission.review_result === 'REJECTED'
      ? '验收失败'
      : submission.review_result;
  return (
    <dl className="tsw-reqHistoryFields">
      <HistoryField label="验收结论" value={resultLabel} />
      <HistoryField label="验收说明" value={submission.review_comment} />
      <HistoryField label="发布说明" value={submission.release_note} />
      <HistoryField label="提交人" value={submission.operator_name} />
      <HistoryField label="提交时间" value={formatTime(submission.submitted_at)} />
    </dl>
  );
}

function StatusChangeList({ items }: { items: StatusChangeLogEntry[] }) {
  if (!items.length) return null;
  return (
    <div className="tsw-reqHistoryChanges">
      <h4 className="tsw-reqDevSubTitle">状态流转记录</h4>
      <ol className="tsw-reqDevLogList">
        {items.map((item) => (
          <li key={item.id} className="tsw-reqDevLogItem">
            <span className="tsw-reqDevLogTime">{formatTime(item.created_at)}</span>
            <div>
              <strong>{item.operator_name || `用户 #${item.operator_user_id}`}</strong>
              <p className="tsw-muted">
                {item.from_status
                  ? `${REQUIREMENT_PHASE_BADGE[item.from_status] ?? item.from_status} → `
                  : ''}
                {REQUIREMENT_PHASE_BADGE[item.to_status] ?? item.to_status}
              </p>
              {item.remark ? <p className="tsw-muted">{item.remark}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RequirementPhaseHistoryPanel({
  step,
  requirement,
  members,
  timeline,
  loading,
  error,
}: Props) {
  const productOwner = members.find((m) => m.user_id === requirement.product_owner_user_id);
  const ownerName = productOwner ? userDisplayName(productOwner.user_name) : '—';
  const submission = submissionForStep(timeline, step.id);
  const changes = statusChangesForStep(timeline, step.id);

  return (
    <section className="tsw-card tsw-reqDetailSection tsw-reqHistoryPanel">
      <div className="tsw-reqSectionHead">
        <div>
          <h3 className="tsw-reqSectionTitle">{step.title}</h3>
          <p className="tsw-muted tsw-reqDevAssignHint">历史节点信息（只读）</p>
        </div>
        <span className="tsw-tag tsw-tagMuted">历史记录</span>
      </div>

      {loading ? <p className="tsw-muted">加载历史记录…</p> : null}
      {error ? <p className="tsw-error">{error}</p> : null}

      {!loading && !error ? (
        <>
          {step.id === 'product-design' ? (
            <ProductDesignHistory submission={submission} ownerName={ownerName} />
          ) : null}
          {step.id === 'dev-assign' ? (
            <DevAssignHistory submission={submission} requirement={requirement} members={members} />
          ) : null}
          {step.id === 'development' ? (
            <DevelopmentHistory submission={submission} />
          ) : null}
          {step.id === 'testing' ? (
            <TestingHistory submission={submission} members={members} />
          ) : null}
          {step.id === 'acceptance' ? (
            <AcceptanceHistory submission={submission} />
          ) : null}
          <StatusChangeList items={changes} />
        </>
      ) : null}
    </section>
  );
}

export function requirementPhaseStepByIndex(index: number) {
  return REQUIREMENT_PHASE_STEPS[index];
}
