import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Project } from '../../types';
import type { WpsChat } from '../../types/wps';
import { WpsDialogShell } from './WpsDialogShell';

interface Props {
  onClose: () => void;
  onSelect: (chat: WpsChat) => void | Promise<void>;
}

export function WpsChatPickerDialog({ onClose, onSelect }: Props) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WpsChat[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api.listWpsChats(keyword.trim()).then(
      (res) => {
        if (cancelled) return;
        setItems((res.items ?? []).filter((chat) => chat.type === 'group' || !chat.type));
      },
      (err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : '加载群聊失败');
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [keyword]);

  const handleSelect = async (chat: WpsChat) => {
    setSubmitting(true);
    setError(null);
    try {
      await onSelect(chat);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '关联失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WpsDialogShell
      title="选择已有 WPS 群聊"
      subtitle="从当前账号可访问的群聊中选择并关联到项目。"
      wide
      onClose={onClose}
      actions={(
        <button type="button" className="tsw-btn" onClick={onClose} disabled={submitting}>
          取消
        </button>
      )}
    >
      <div className="tsw-wpsPickerSearch">
        <span className="tsw-memberSearchIcon" aria-hidden="true">🔍</span>
        <input
          className="tsw-memberSearchInput"
          placeholder="搜索群聊名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {loading ? <p className="tsw-muted tsw-memberSearchEmpty">正在加载群聊…</p> : null}
      {!loading && !items.length && !error ? (
        <p className="tsw-muted tsw-memberSearchEmpty">未找到可关联的群聊</p>
      ) : null}

      <div className="tsw-wpsPickerList">
        {items.map((chat) => (
          <button
            key={chat.id}
            type="button"
            className="tsw-wpsDocRow"
            disabled={submitting}
            onClick={() => void handleSelect(chat)}
          >
            <span className="tsw-groupOptionIcon" aria-hidden="true">💬</span>
            <span className="tsw-wpsDocRowText">
              <strong>{chat.name || `群聊 ${chat.id}`}</strong>
              <span className="tsw-muted">{chat.status || chat.type || 'group'}</span>
            </span>
          </button>
        ))}
      </div>

      {error ? <p className="tsw-error">{error}</p> : null}
    </WpsDialogShell>
  );
}

interface PanelProps {
  project: Project;
  canManage?: boolean;
  onProjectUpdated?: (project: Project) => void;
}

export function WpsGroupChatPanel({ project, canManage = false, onProjectUpdated }: PanelProps) {
  const [groupName, setGroupName] = useState(project.wps_group_name ?? '');
  const [groupId, setGroupId] = useState(project.wps_group_id ?? '');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChatPicker, setShowChatPicker] = useState(false);

  useEffect(() => {
    setGroupName(project.wps_group_name ?? '');
    setGroupId(project.wps_group_id ?? '');
  }, [project.id, project.wps_group_id, project.wps_group_name]);

  const saveGroup = async (nextId: string, nextName: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProjectSetup(project.id, {
        wps_group_id: nextId,
        wps_group_name: nextName,
      });
      setGroupId(updated.wps_group_id ?? nextId);
      setGroupName(updated.wps_group_name ?? nextName);
      onProjectUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim() || `${project.name} 项目群`;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createProjectWpsGroup(project.id, name);
      const chat = result.chat;
      const updated = result.project;
      setGroupId(chat.id);
      setGroupName(chat.name || name);
      onProjectUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建群聊失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="tsw-card">
      <div className="tsw-createWizardHeadingRow">
        <h3 className="tsw-membersPanelTitle">WPS 项目群</h3>
        {groupId ? <span className="tsw-badge">已关联</span> : <span className="tsw-badge tsw-badgeMuted">未关联</span>}
      </div>
      <p className="tsw-muted tsw-createWizardSub">
        一键创建群聊并邀请项目成员，或关联已有 WPS 群聊。
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
            disabled={!canManage || saving}
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
            disabled={!canManage || creating || saving}
            onClick={() => void handleCreateGroup()}
          >
            {creating ? '创建中…' : '创建项目群'}
          </button>
        </div>
      </div>

      <div className="tsw-formRow">
        <label className="tsw-fieldLabel" htmlFor="project-group-name">群名称</label>
        <input
          id="project-group-name"
          className="tsw-input"
          placeholder={`${project.name} 项目群`}
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          disabled={!canManage}
        />
      </div>

      {groupId ? (
        <div className="tsw-createSummary">
          <dl className="tsw-kv tsw-createSummaryKv">
            <dt>群聊 ID</dt>
            <dd>{groupId}</dd>
            <dt>群名称</dt>
            <dd>{groupName || '—'}</dd>
          </dl>
        </div>
      ) : null}

      {!canManage ? (
        <p className="tsw-muted tsw-membersPanelHint">仅项目管理员可创建或关联项目群。</p>
      ) : null}

      {error ? <p className="tsw-error">{error}</p> : null}

      {showChatPicker ? (
        <WpsChatPickerDialog
          onClose={() => setShowChatPicker(false)}
          onSelect={async (chat) => {
            await saveGroup(chat.id, chat.name || groupName.trim() || `${project.name} 项目群`);
          }}
        />
      ) : null}
    </div>
  );
}
