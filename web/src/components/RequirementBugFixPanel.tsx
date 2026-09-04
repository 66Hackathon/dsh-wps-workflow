import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ProjectMember, Requirement } from '../types';
import { REQUIREMENT_STATUS_LABELS } from '../types';
import { userDisplayName } from '../memberRoles';
import { REQUIREMENT_PHASE_BADGE } from '../requirementPhase';

function memberName(members: ProjectMember[], userId?: number): string {
  if (!userId) return '未指定';
  const m = members.find((item) => item.user_id === userId);
  return m ? userDisplayName(m.user_name) : `用户 ${userId}`;
}

function parentIdOf(requirement: Requirement): number | undefined {
  return requirement.parent_requirement_id || requirement.parent_item_id;
}

/** 主需求展示关联 Bug 子需求 */
export function RequirementBugFixingPanel({
  requirement,
  members,
  currentUserId,
  onRequirementUpdated,
  onOpenRequirement,
}: {
  requirement: Requirement;
  members: ProjectMember[];
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
  onOpenRequirement?: (requirementId: number) => void;
}) {
  const [children, setChildren] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const isTester = currentUserId != null && requirement.tester_user_id === currentUserId;
  const allClosed = children.length > 0
    && children.every((item) => item.current_status === 'CLOSED');

  const reload = () => {
    setLoading(true);
    setError(null);
    void api.listRequirementBugs(requirement.id)
      .then((res) => setChildren(res.items ?? []))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载缺陷失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, [requirement.id, requirement.status_version]);

  const handleResume = async () => {
    setSubmitting(true);
    setError(null);
    setActionOk(null);
    try {
      const updated = await api.resumeTestingFromBugFix(requirement.id, '缺陷修复已确认，返回测试复验');
      onRequirementUpdated(updated);
      setActionOk('已返回测试阶段，请再次验收。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <div className="tsw-reqSectionHead">
        <h3 className="tsw-reqSectionTitle">关联 Bug 需求</h3>
        <span className="tsw-tag tsw-tagWarn">独立修复中</span>
      </div>
      <p className="tsw-muted" style={{ marginBottom: 12 }}>
        Bug 需求独立研发与测试。可在需求列表筛选「仅 Bug」查看，或从下方打开。
      </p>

      {loading ? <p className="tsw-muted">加载中…</p> : null}
      {error ? <p className="tsw-error">{error}</p> : null}
      {actionOk ? <p className="tsw-success">{actionOk}</p> : null}

      {!loading ? (
        <>
          {children.length === 0 ? (
            <p className="tsw-muted">暂无关联 Bug</p>
          ) : (
            <ul className="tsw-reqBugList">
              {children.map((bug) => (
                <li key={bug.id} className="tsw-reqBugItem">
                  <div>
                    <strong>{bug.requirement_code}</strong>
                    <span> {bug.title}</span>
                  </div>
                  <div className="tsw-reqBugMeta">
                    <span className="tsw-tag">
                      {REQUIREMENT_PHASE_BADGE[bug.current_status]
                        ?? REQUIREMENT_STATUS_LABELS[bug.current_status]
                        ?? bug.current_status}
                    </span>
                    <span>研发：{memberName(members, bug.developer_user_id || bug.backend_developer_user_id)}</span>
                    {onOpenRequirement ? (
                      <button
                        type="button"
                        className="tsw-linkBtn"
                        onClick={() => onOpenRequirement(bug.id)}
                      >
                        打开
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isTester ? (
            <div className="tsw-reqTestPlanFooter">
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                disabled={submitting || !allClosed}
                title={!allClosed ? '需等全部关联 Bug 关闭' : undefined}
                onClick={() => void handleResume()}
              >
                {submitting ? '处理中…' : '确认修复完成，返回测试'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** 缺陷修复子需求：研发提交修复完成（走标准研发完成接口） */
export function RequirementBugFixWorkPanel({
  requirement,
  members,
  currentUserId,
  onRequirementUpdated,
  onOpenParent,
}: {
  requirement: Requirement;
  members: ProjectMember[];
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
  onOpenParent?: (parentId: number) => void;
}) {
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const parentId = parentIdOf(requirement);

  const canComplete =
    currentUserId != null
    && (requirement.developer_user_id === currentUserId
      || requirement.backend_developer_user_id === currentUserId);
  const ownCompleted = currentUserId != null && (
    (requirement.developer_user_id === currentUserId && requirement.frontend_development_completed)
    || (requirement.backend_developer_user_id === currentUserId && requirement.backend_development_completed)
  );
  const canSubmit = canComplete && !ownCompleted && requirement.current_status === 'DEVELOPMENT';

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      const result = await api.completeDevelopment(requirement.id, {
        dev_summary: summary.trim() || '缺陷已修复，请复测。',
        implementation_notes: notes.trim() || '已完成代码修复与自测。',
      });
      onRequirementUpdated(result.requirement);
      setOk(result.transitioned
        ? '修复已提交，Bug 需求进入测试。'
        : '你的修复已提交，等待其他负责人完成。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <div className="tsw-reqSectionHead">
        <h3 className="tsw-reqSectionTitle">缺陷修复</h3>
        <span className="tsw-tag">{REQUIREMENT_STATUS_LABELS[requirement.current_status] ?? requirement.current_status}</span>
      </div>
      {parentId ? (
        <p className="tsw-muted" style={{ marginBottom: 12 }}>
          关联主需求 ID {parentId}
          {onOpenParent ? (
            <>
              {' · '}
              <button
                type="button"
                className="tsw-linkBtn"
                onClick={() => onOpenParent(parentId)}
              >
                返回主需求
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      <p style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{requirement.description}</p>

      <div className="tsw-reqBugMeta" style={{ marginBottom: 16 }}>
        {requirement.developer_user_id ? (
          <span>
            前端：{memberName(members, requirement.developer_user_id)}
            {' · '}
            {requirement.frontend_development_completed ? '已提交' : '待提交'}
          </span>
        ) : null}
        {requirement.backend_developer_user_id ? (
          <span>
            后端：{memberName(members, requirement.backend_developer_user_id)}
            {' · '}
            {requirement.backend_development_completed ? '已提交' : '待提交'}
          </span>
        ) : null}
      </div>

      {requirement.current_status !== 'DEVELOPMENT' ? (
        <p className="tsw-success">当前状态：{REQUIREMENT_PHASE_BADGE[requirement.current_status] ?? requirement.current_status}</p>
      ) : (
        <>
          <label className="tsw-field">
            <span>修复说明</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="简述修复内容"
              disabled={!canSubmit}
            />
          </label>
          <label className="tsw-field">
            <span>实现备注</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="自测结果、影响面等"
              disabled={!canSubmit}
            />
          </label>
          {error ? <p className="tsw-error">{error}</p> : null}
          {ok ? <p className="tsw-success">{ok}</p> : null}
          <div className="tsw-reqActionRow">
            {canSubmit ? (
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                disabled={submitting}
                onClick={() => void handleComplete()}
              >
                {submitting ? '提交中…' : '提交修复完成'}
              </button>
            ) : ownCompleted ? (
              <span className="tsw-tag tsw-tagSuccess">你已提交，等待其他负责人</span>
            ) : (
              <span className="tsw-tag tsw-tagMuted">仅指派研发可提交修复</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
