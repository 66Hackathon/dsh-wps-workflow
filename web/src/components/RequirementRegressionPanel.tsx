import { useState } from 'react';
import { api } from '../api/client';
import { isRequirementProductOwner, PRODUCT_OWNER_ONLY_HINT } from '../requirementPermissions';
import type { ProjectMember, Requirement } from '../types';

/** 回归测试：提交成功/失败；失败关闭后可再改为成功 */
export function RequirementRegressionPanel({
  requirement,
  currentUserId,
  onRequirementUpdated,
}: {
  requirement: Requirement;
  members: ProjectMember[];
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
}) {
  const isClosed = requirement.current_status === 'CLOSED';
  const [result, setResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [amending, setAmending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canOperate = isRequirementProductOwner(requirement, currentUserId)
    || requirement.tester_user_id === currentUserId;

  const handleSubmit = async () => {
    if (!canOperate) {
      setError('仅产品负责人或测试负责人可提交回归结果');
      return;
    }
    const text = summary.trim() || (result === 'PASS' ? '回归测试通过' : '回归测试失败');
    setSubmitting(true);
    setError(null);
    setOkMsg(null);
    try {
      const updated = await api.transitionRequirement(requirement.id, 'CLOSED', {
        regression_result: result,
        regression_summary: text,
        remark: result === 'PASS' ? '回归通过，需求关闭' : '回归失败，需求关闭（可后续改为成功）',
      });
      onRequirementUpdated(updated);
      setOkMsg(result === 'PASS' ? '回归通过，需求已关闭。' : '回归失败已记录，需求已关闭。可稍后改为成功。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmendToPass = async () => {
    if (!canOperate) {
      setError('仅产品负责人或测试负责人可修改回归结果');
      return;
    }
    setAmending(true);
    setError(null);
    try {
      await api.updateRegressionResult(
        requirement.id,
        summary.trim() || '回归结果已改为成功',
      );
      setOkMsg('回归结果已改为成功。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setAmending(false);
    }
  };

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <div className="tsw-reqSectionHead">
        <h3 className="tsw-reqSectionTitle">回归测试</h3>
        <span className="tsw-tag">{isClosed ? '已关闭' : '回归中'}</span>
      </div>
      <p className="tsw-muted" style={{ marginBottom: 16 }}>
        {isClosed
          ? '需求已关闭。若此前回归失败，可将结果改为成功。'
          : '产品验收通过后进入回归。提交成功或失败后需求关闭；若失败，后续可将结果改为成功。'}
      </p>

      {canOperate ? (
        <>
          {!isClosed ? (
            <>
              <div className="tsw-reqTestRadioGroup">
                <label className="tsw-reqTestRadio">
                  <input
                    type="radio"
                    name="regression-result"
                    checked={result === 'PASS'}
                    onChange={() => setResult('PASS')}
                  />
                  成功
                </label>
                <label className="tsw-reqTestRadio">
                  <input
                    type="radio"
                    name="regression-result"
                    checked={result === 'FAIL'}
                    onChange={() => setResult('FAIL')}
                  />
                  失败
                </label>
              </div>

              <textarea
                className="tsw-input"
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="回归说明（可选）"
              />
            </>
          ) : (
            <textarea
              className="tsw-input"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="改为成功时的说明（可选）"
            />
          )}

          {error ? <p className="tsw-error">{error}</p> : null}
          {okMsg ? <p className="tsw-success">{okMsg}</p> : null}

          <div className="tsw-reqTestPlanFooter">
            {!isClosed ? (
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                disabled={submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? '提交中…' : '提交回归结果并关闭'}
              </button>
            ) : (
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                disabled={amending}
                onClick={() => void handleAmendToPass()}
              >
                {amending ? '修改中…' : '将失败改为成功'}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="tsw-muted">{PRODUCT_OWNER_ONLY_HINT}（或测试负责人）</p>
      )}
    </section>
  );
}
