import { useState } from 'react';
import { api } from '../../api/client';
import type { Project } from '../../types';
import { CreateStepFooter } from './CreateStepFooter';

interface Props {
  project: Project;
  memberCount: number;
  repoLabel: string;
  onPrev: () => void;
  onFinish: () => void;
}

export function CreateProjectGroupStep({
  project,
  memberCount,
  repoLabel,
  onPrev,
  onFinish,
}: Props) {
  const [groupName, setGroupName] = useState(project.wps_group_name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (skip = false) => {
    setSubmitting(true);
    setError(null);
    try {
      if (!skip && groupName.trim()) {
        await api.updateProjectSetup(project.id, {
          wps_group_name: groupName.trim(),
          wps_group_id: `demo-group-${project.id}`,
        });
      }
      onFinish();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const groupLabel = groupName.trim() || '未关联';

  return (
    <div className="tsw-createWizardLayout">
      <div className="tsw-createWizardMain">
        <div className="tsw-createForm tsw-createWizardCard">
          <div className="tsw-createWizardHeadingRow">
            <h3 className="tsw-createWizardHeading">关联 WPS 项目群</h3>
            <span className="tsw-badge tsw-badgeMuted">可选 · 暂未开放</span>
          </div>
          <p className="tsw-muted tsw-createWizardSub">
            项目群不是创建项目的必要条件，创建后可以随时添加或更换
          </p>

          <div className="tsw-groupOptionGrid">
            <div className="tsw-groupOptionCard">
              <span className="tsw-groupOptionIcon" aria-hidden="true">💬</span>
              <div>
                <strong>关联已有群聊</strong>
                <p className="tsw-muted">从当前用户可访问的 WPS 群聊中选择</p>
              </div>
              <button type="button" className="tsw-btn" disabled>
                选择群聊
              </button>
            </div>
            <div className="tsw-groupOptionCard">
              <span className="tsw-groupOptionIcon tsw-groupOptionIconCreate" aria-hidden="true">＋</span>
              <div>
                <strong>创建新的项目群</strong>
                <p className="tsw-muted">创建群聊并自动邀请当前项目成员</p>
              </div>
              <button type="button" className="tsw-btn" disabled>
                创建项目群
              </button>
            </div>
          </div>

          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="group-name">群名称（Demo 可选填）</label>
            <input
              id="group-name"
              className="tsw-input"
              placeholder="可不填，跳过即可"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div className="tsw-infoBanner">
            <span aria-hidden="true">ℹ️</span>
            <span>
              当前版本暂不调用 WPS 群聊能力，项目创建后可在「项目群」页面继续配置。
            </span>
          </div>

          <div className="tsw-createSummary">
            <h4>创建内容确认</h4>
            <dl className="tsw-kv tsw-createSummaryKv">
              <dt>项目名称</dt>
              <dd>{project.name}</dd>
              <dt>项目成员</dt>
              <dd>{memberCount} 人</dd>
              <dt>代码仓库</dt>
              <dd>{repoLabel}</dd>
              <dt>项目群</dt>
              <dd>{groupLabel}</dd>
            </dl>
          </div>

          {error ? <p className="tsw-error">{error}</p> : null}

          <CreateStepFooter
            onPrev={onPrev}
            skipLabel="跳过并创建"
            onSkip={() => void finish(true)}
            nextLabel="创建项目"
            onNext={() => void finish(false)}
            nextLoading={submitting}
            showSkip
          />
        </div>
      </div>

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard">
          <div className="tsw-createAsideHead">
            <strong>项目群后续能力</strong>
            <span className="tsw-badge tsw-badgeMuted">后续开放</span>
          </div>
          <ul className="tsw-createAsideList">
            <li>项目通知与状态同步</li>
            <li>群内 @机器人 查询项目</li>
            <li>需求、Bug、任务推送</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
