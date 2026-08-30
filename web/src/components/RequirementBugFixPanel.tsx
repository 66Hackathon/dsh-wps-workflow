import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Bug, ProjectMember, Requirement } from '../types';
import { REQUIREMENT_STATUS_LABELS } from '../types';
import { userDisplayName } from '../memberRoles';

function memberName(members: ProjectMember[], userId?: number): string {
  if (!userId) return '未指定';
  const m = members.find((item) => item.user_id === userId);
  return m ? userDisplayName(m.user_name) : `用户 ${userId}`;
}

function bugStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case 'OPEN':
      return '待修复';
    case 'IN_PROGRESS':
      return '修复中';
    case 'FIXED':
      return '已修复';
    case 'VERIFIED':
      return '已验证';
    case 'CLOSED':
      return '已关闭';
    default:
      return status;
  }
}

/** 主需求处于 BUG_FIXING：展示关联缺陷与修复需求，测试确认后返回复验 */
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
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [children, setChildren] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const linkedBugs = bugs.filter((b) => b.fix_requirement_id);
  const isTester = currentUserId != null && requirement.tester_user_id === currentUserId;
  const allFixed = linkedBugs.length > 0 && linkedBugs.every((b) => {
    const s = b.status.toUpperCase();
    return s === 'FIXED' || s === 'VERIFIED' || s === 'CLOSED';
  });

  const reload = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.listRequirementBugs(requirement.id),
      api.listChildRequirements(requirement.id),
    ])
      .then(([bugRes, childRes]) => {
        setBugs(bugRes.items);
        setChildren(childRes.items);
      })
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
        <h3 className="tsw-reqSectionTitle">Bug 修复中</h3>
        <span className="tsw-tag tsw-tagWarn">主需求等待缺陷修复</span>
      </div>
      <p className="tsw-muted" style={{ marginBottom: 12 }}>
        测试失败后已生成关联的缺陷修复需求。研发在修复需求中完成修复并确认后，测试可返回本需求再次验收。
      </p>

      {loading ? <p className="tsw-muted">加载中…</p> : null}
      {error ? <p className="tsw-error">{error}</p> : null}
      {actionOk ? <p className="tsw-success">{actionOk}</p> : null}

      {!loading ? (
        <>
          <h4 className="tsw-reqSubTitle">关联缺陷</h4>
          {bugs.length === 0 ? (
            <p className="tsw-muted">暂无缺陷</p>
          ) : (
            <ul className="tsw-reqBugList">
              {bugs.map((bug) => (
                <li key={bug.id} className="tsw-reqBugItem">
                  <div>
                    <strong>{bug.bug_code}</strong>
                    <span> {bug.title}</span>
                  </div>
                  <div className="tsw-reqBugMeta">
                    <span className="tsw-tag">{bugStatusLabel(bug.status)}</span>
                    <span>指派：{memberName(members, bug.assignee_user_id)}</span>
                    {bug.fix_requirement_id && onOpenRequirement ? (
                      <button
                        type="button"
                        className="tsw-linkBtn"
                        onClick={() => onOpenRequirement(bug.fix_requirement_id!)}
                      >
                        进入修复需求
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h4 className="tsw-reqSubTitle" style={{ marginTop: 16 }}>修复需求</h4>
          {children.length === 0 ? (
            <p className="tsw-muted">暂无修复需求</p>
          ) : (
            <ul className="tsw-reqBugList">
              {children.map((child) => (
                <li key={child.id} className="tsw-reqBugItem">
                  <div>
                    <strong>{child.requirement_code}</strong>
                    <span> {child.title}</span>
                  </div>
                  <div className="tsw-reqBugMeta">
                    <span className="tsw-tag">
                      {REQUIREMENT_STATUS_LABELS[child.current_status] ?? child.current_status}
                    </span>
                    {onOpenRequirement ? (
                      <button
                        type="button"
                        className="tsw-linkBtn"
                        onClick={() => onOpenRequirement(child.id)}
                      >
                        打开
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="tsw-reqActionRow" style={{ marginTop: 20 }}>
            {isTester ? (
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                disabled={submitting || !allFixed}
                onClick={() => void handleResume()}
                title={!allFixed ? '需等全部缺陷标记为已修复' : undefined}
              >
                {submitting ? '提交中…' : '确认修复完成，返回测试复验'}
              </button>
            ) : (
              <span className="tsw-tag tsw-tagMuted">仅测试负责人可确认返回复验</span>
            )}
            {!allFixed && linkedBugs.length > 0 ? (
              <span className="tsw-muted">尚有未修复缺陷，研发请在修复需求中提交完成。</span>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** 缺陷修复子需求：研发提交修复完成 */
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

  const canComplete =
    currentUserId != null
    && (requirement.developer_user_id === currentUserId
      || requirement.backend_developer_user_id === currentUserId);
  const ownCompleted = currentUserId != null && (
    (requirement.developer_user_id === currentUserId && requirement.frontend_development_completed)
    || (requirement.backend_developer_user_id === currentUserId && requirement.backend_development_completed)
  );
  const canSubmit = canComplete && !ownCompleted;
  const isDone = requirement.current_status === 'DONE';

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      const result = await api.completeBugFix(requirement.id, {
        dev_summary: summary.trim() || '缺陷已修复，请复测。',
        implementation_notes: notes.trim() || '已完成代码修复与自测。',
      });
      onRequirementUpdated(result.requirement);
      setOk(result.requirement.current_status === 'DONE'
        ? `所有修复负责人均已提交，${result.bug.bug_code} 已进入待复测。`
        : `你的修复已提交，等待另一位修复负责人完成后再进入待复测。`);
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
      {requirement.parent_requirement_id ? (
        <p className="tsw-muted" style={{ marginBottom: 12 }}>
          关联主需求 ID {requirement.parent_requirement_id}
          {onOpenParent ? (
            <>
              {' · '}
              <button
                type="button"
                className="tsw-linkBtn"
                onClick={() => onOpenParent(requirement.parent_requirement_id!)}
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

      {isDone ? (
        <p className="tsw-success">修复已提交。等待测试在主需求确认后再次验收。</p>
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
