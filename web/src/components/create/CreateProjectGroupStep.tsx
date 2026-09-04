import { useState } from 'react';
import { api } from '../../api/client';
import type { Project } from '../../types';
import { WpsChatPickerDialog } from '../wps/WpsGroupChatPanel';
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
  const [groupName, setGroupName] = useState(project.wps_group_name ?? `${project.name} 项目群`);
  const [groupId, setGroupId] = useState(project.wps_group_id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChatPicker, setShowChatPicker] = useState(false);

  const saveGroup = async (nextId: string, nextName: string, finishAfter = false) => {
    setSubmitting(true);
    setError(null);
    try {
      await api.updateProjectSetup(project.id, {
        wps_group_name: nextName,
        wps_group_id: nextId,
      });
      setGroupId(nextId);
      setGroupName(nextName);
      if (finishAfter) onFinish();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGroup = async (finishAfter = false) => {
    const name = groupName.trim() || `${project.name} 项目群`;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createProjectWpsGroup(project.id, name);
      setGroupId(result.chat.id);
      setGroupName(result.chat.name || name);
      if (finishAfter) onFinish();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建群聊失败');
    } finally {
      setCreating(false);
    }
  };

  const finish = async (skip = false) => {
    if (skip) {
      onFinish();
      return;
    }
    if (groupId) {
      await saveGroup(groupId, groupName.trim() || `${project.name} 项目群`, true);
      return;
    }
    onFinish();
  };

  const groupLabel = groupId
    ? `${groupName || '已关联群聊'} (${groupId})`
    : groupName.trim() || '未关联';

  return (
    <div className="tsw-createWizardLayout">
      <div className="tsw-createWizardMain">
        <div className="tsw-createForm tsw-createWizardCard">
          <div className="tsw-createWizardHeadingRow">
            <h3 className="tsw-createWizardHeading">关联 WPS 项目群</h3>
            <span className="tsw-badge">WPS 集成</span>
          </div>
          <p className="tsw-muted tsw-createWizardSub">
            项目群不是创建项目的必要条件，也可在此一键创建并邀请项目成员。
          </p>

          <div className="tsw-groupOptionGrid">
            <div className="tsw-groupOptionCard">
              <span className="tsw-groupOptionIcon" aria-hidden="true">💬</span>
              <div>
                <strong>关联已有群聊</strong>
                <p className="tsw-muted">从当前用户可访问的 WPS 群聊中选择</p>
              </div>
              <button
                type="button"
                className="tsw-btn"
                disabled={submitting || creating}
                onClick={() => setShowChatPicker(true)}
              >
                选择群聊
              </button>
            </div>
            <div className="tsw-groupOptionCard">
              <span className="tsw-groupOptionIcon tsw-groupOptionIconCreate" aria-hidden="true">＋</span>
              <div>
                <strong>一键创建项目群</strong>
                <p className="tsw-muted">创建群聊并自动邀请当前项目成员</p>
              </div>
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                disabled={submitting || creating}
                onClick={() => void handleCreateGroup(false)}
              >
                {creating ? '创建中…' : '创建项目群'}
              </button>
            </div>
          </div>

          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="group-name">群名称</label>
            <input
              id="group-name"
              className="tsw-input"
              placeholder="可不填，跳过即可"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          {groupId ? (
            <div className="tsw-infoBanner">
              <span aria-hidden="true">✓</span>
              <span>已关联群聊：{groupName || groupId}</span>
            </div>
          ) : (
            <div className="tsw-infoBanner">
              <span aria-hidden="true">ℹ️</span>
              <span>也可跳过此步骤，稍后在项目「项目群」Tab 中继续配置。</span>
            </div>
          )}

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
            nextLabel="完成创建"
            onNext={() => void finish(false)}
            nextLoading={submitting || creating}
            showSkip
          />
        </div>
      </div>

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard">
          <div className="tsw-createAsideHead">
            <strong>项目群能力</strong>
            <span className="tsw-badge">WPS IM</span>
          </div>
          <ul className="tsw-createAsideList">
            <li>一键邀请项目成员进群</li>
            <li>关联已有企业群聊</li>
            <li>项目通知与状态同步（规划中）</li>
          </ul>
        </div>
      </aside>

      {showChatPicker ? (
        <WpsChatPickerDialog
          onClose={() => setShowChatPicker(false)}
          onSelect={async (chat) => {
            await saveGroup(chat.id, chat.name || groupName.trim() || `${project.name} 项目群`, false);
          }}
        />
      ) : null}
    </div>
  );
}
