import { useState } from 'react';
import { api } from '../api/client';
import { userAvatarColor, userAvatarLetter, userDisplayName } from '../memberRoles';
import { formatRelativeFromISO } from '../projectDisplay';
import { isRequirementProductOwner, PRODUCT_OWNER_ONLY_HINT } from '../requirementPermissions';
import type { ProjectMember, Requirement } from '../types';

/** 主需求处于 DONE（待验收）：产品负责人验收通过/失败 */
export function RequirementAcceptancePanel({
  requirement,
  members,
  currentUserId,
  onRequirementUpdated,
}: {
  requirement: Requirement;
  members: ProjectMember[];
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
}) {
  const [conclusion, setConclusion] = useState<'PASS' | 'FAIL'>('PASS');
  const [comment, setComment] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAccept = isRequirementProductOwner(requirement, currentUserId);
  const productOwner = members.find((member) => member.user_id === requirement.product_owner_user_id);
  const ownerName = productOwner
    ? userDisplayName(productOwner.user_name)
    : requirement.product_owner_user_id
      ? `用户 ${requirement.product_owner_user_id}`
      : '未指定';

  const handleSubmit = async () => {
    if (!canAccept || !currentUserId) {
      setError(PRODUCT_OWNER_ONLY_HINT);
      return;
    }
    const note = comment.trim();
    if (!note) {
      setError('请填写验收说明');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (conclusion === 'PASS') {
        const release = releaseNote.trim() || note;
        const updated = await api.transitionRequirement(requirement.id, 'ARCHIVED', {
          review_result: 'APPROVED',
          review_comment: note,
          release_note: release,
          closed_by_user_id: currentUserId,
          remark: '产品验收通过，需求已归档',
        });
        onRequirementUpdated(updated);
      } else {
        const updated = await api.transitionRequirement(requirement.id, 'DEVELOPMENT', {
          review_result: 'REJECTED',
          review_comment: note,
          remark: '产品验收失败，退回研发',
        });
        onRequirementUpdated(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '验收提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canAccept) {
    return (
      <section className="tsw-card tsw-reqDetailSection">
        <div className="tsw-reqSectionHead">
          <div>
            <h3 className="tsw-reqSectionTitle">产品验收</h3>
            <p className="tsw-muted tsw-reqAcceptReadonlyDesc">
              测试已通过，等待产品负责人完成验收。
            </p>
          </div>
          <span className="tsw-tag">待验收</span>
        </div>

        <div className="tsw-reqAcceptReadonlySummary">
          <div className="tsw-reqAcceptReadonlyItem">
            <span className="tsw-reqAcceptReadonlyIcon" aria-hidden="true">▣</span>
            <div>
              <span className="tsw-muted">验收状态</span>
              <strong className="tsw-reqDevProgressValue">待验收</strong>
            </div>
          </div>
          <div className="tsw-reqAcceptReadonlyItem">
            <span
              className="tsw-userAvatar"
              style={{ background: userAvatarColor(ownerName) }}
              aria-hidden="true"
            >
              {userAvatarLetter(ownerName)}
            </span>
            <div>
              <span className="tsw-muted">验收人</span>
              <strong>{ownerName} <em>（产品负责人）</em></strong>
            </div>
          </div>
          <div className="tsw-reqAcceptReadonlyItem">
            <span className="tsw-reqAcceptReadonlyIcon" aria-hidden="true">◷</span>
            <div>
              <span className="tsw-muted">提交验收</span>
              <strong>{formatRelativeFromISO(requirement.updated_at)}</strong>
            </div>
          </div>
        </div>

        <div className="tsw-reqAcceptTestResult">
          <span className="tsw-reqAcceptResultIcon" aria-hidden="true">✓</span>
          <span>测试结果：已通过</span>
        </div>

        <p className="tsw-muted tsw-reqAcceptReadonlyHint">
          ⓘ 验收结果提交后将在此同步展示
        </p>
      </section>
    );
  }

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <div className="tsw-reqSectionHead">
        <h3 className="tsw-reqSectionTitle">产品验收</h3>
        <span className="tsw-tag">待验收</span>
      </div>
      <p className="tsw-muted" style={{ marginBottom: 16 }}>
        测试已通过，请产品负责人确认是否达到验收标准。通过后归档完成；失败将退回研发阶段。
      </p>

      <div className="tsw-reqAcceptChoices" role="radiogroup" aria-label="验收结论">
        <label className="tsw-reqAcceptChoice" data-active={conclusion === 'PASS' ? 'true' : 'false'}>
          <input
            type="radio"
            name="acceptance-conclusion"
            checked={conclusion === 'PASS'}
            disabled={!canAccept}
            onChange={() => setConclusion('PASS')}
          />
          <span>验收通过</span>
          <small>需求归档为已完成</small>
        </label>
        <label className="tsw-reqAcceptChoice" data-active={conclusion === 'FAIL' ? 'true' : 'false'}>
          <input
            type="radio"
            name="acceptance-conclusion"
            checked={conclusion === 'FAIL'}
            disabled={!canAccept}
            onChange={() => setConclusion('FAIL')}
          />
          <span>验收失败</span>
          <small>退回研发继续修改</small>
        </label>
      </div>

      <label className="tsw-field">
        <span>{conclusion === 'PASS' ? '验收说明' : '失败原因'}</span>
        <textarea
          rows={4}
          value={comment}
          disabled={!canAccept}
          placeholder={conclusion === 'PASS' ? '说明验收依据、遗留项等' : '说明未通过原因与期望修改点'}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>

      {conclusion === 'PASS' ? (
        <label className="tsw-field">
          <span>发布说明（可选，默认用验收说明）</span>
          <textarea
            rows={3}
            value={releaseNote}
            disabled={!canAccept}
            placeholder="版本发布说明 / 上线备注"
            onChange={(e) => setReleaseNote(e.target.value)}
          />
        </label>
      ) : null}

      {error ? <p className="tsw-error">{error}</p> : null}

      <div className="tsw-reqActionRow" style={{ marginTop: 16 }}>
        {canAccept ? (
          <button
            type="button"
            className="tsw-btn tsw-btnPrimary tsw-btnSolid"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? '提交中…'
              : conclusion === 'PASS'
                ? '确认验收通过并归档'
                : '确认验收失败并退回研发'}
          </button>
        ) : (
          <span className="tsw-tag tsw-tagMuted" title={PRODUCT_OWNER_ONLY_HINT}>
            仅产品负责人可验收
          </span>
        )}
      </div>
    </section>
  );
}
