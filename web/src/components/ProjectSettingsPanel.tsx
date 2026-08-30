import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { isProjectManager, userDisplayName } from '../memberRoles';
import { formatDateTime, projectIcon, projectIconStyle } from '../projectDisplay';
import type { Project, ProjectMember } from '../types';
import { FeatureLockedDialog } from './FeatureLockedDialog';
import { ProjectMembersPanel } from './ProjectMembersPanel';

type SettingsTab = 'basic' | 'members' | 'features' | 'danger';

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: 'basic', label: '基本信息' },
  { key: 'members', label: '成员与角色' },
  { key: 'features', label: '功能配置' },
  { key: 'danger', label: '危险操作' },
];

interface Props {
  project: Project;
  members: ProjectMember[];
  currentUserId?: number;
  canManageMembers: boolean;
  onProjectUpdated: (project: Project) => void;
  onMembersChange: (members: ProjectMember[]) => void;
  onProjectDeleted: () => void;
}

export function ProjectSettingsPanel({
  project,
  members,
  currentUserId,
  canManageMembers,
  onProjectUpdated,
  onMembersChange,
  onProjectDeleted,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>('basic');
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const canEdit = currentMember ? isProjectManager(currentMember) : false;

  return (
    <div className="tsw-settingsPage">
      <nav className="tsw-settingsUnderlineNav" aria-label="项目设置">
        {SETTINGS_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className="tsw-settingsUnderlineTab"
            data-active={tab === item.key ? 'true' : 'false'}
            data-tone={item.key === 'danger' ? 'danger' : undefined}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'basic' ? (
        <BasicInfoTab
          project={project}
          members={members}
          canEdit={canEdit}
          onProjectUpdated={onProjectUpdated}
        />
      ) : null}
      {tab === 'members' ? (
        <div className="tsw-card">
          <p className="tsw-muted" style={{ marginTop: 0 }}>
            配置当前项目的成员角色与权限。
          </p>
          <ProjectMembersPanel
            projectId={project.id}
            members={members}
            ownerUserId={project.owner_user_id}
            currentUserId={currentUserId}
            canManage={canManageMembers}
            onMembersChange={onMembersChange}
          />
          <section className="tsw-roleLegend">
            <h4>项目角色说明</h4>
            <ul>
              <li><strong>项目管理员</strong>：管理项目设置、成员与功能配置。</li>
              <li><strong>普通成员</strong>：参与项目协作，查看内容与基本操作。</li>
            </ul>
            <p className="tsw-muted">需求上的产品 / 研发 / 测试职责在需求分配阶段指定，不占用项目角色。</p>
          </section>
        </div>
      ) : null}
      {tab === 'features' ? (
        <FeaturesTab project={project} onLocked={setLockedFeature} />
      ) : null}
      {tab === 'danger' ? (
        <DangerTab
          project={project}
          canEdit={canEdit}
          onDeleted={onProjectDeleted}
          onLocked={setLockedFeature}
        />
      ) : null}
      {lockedFeature ? (
        <FeatureLockedDialog label={lockedFeature} onClose={() => setLockedFeature(null)} />
      ) : null}
    </div>
  );
}

function BasicInfoTab({
  project,
  members,
  canEdit,
  onProjectUpdated,
}: {
  project: Project;
  members: ProjectMember[];
  canEdit: boolean;
  onProjectUpdated: (project: Project) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const iconStyle = projectIconStyle(project);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
  }, [project.id, project.name, project.description]);

  const creator = useMemo(() => {
    const ownerId = project.owner_user_id ?? project.created_by;
    return members.find((m) => m.user_id === ownerId);
  }, [members, project.owner_user_id, project.created_by]);

  const handleSave = async () => {
    if (!canEdit) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('项目名称不能为空');
      return;
    }
    if (description.length > 200) {
      setError('项目简介最多 200 字');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProjectSetup(project.id, {
        name: trimmedName,
        description: description.trim(),
      });
      onProjectUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(project.project_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="tsw-card">
      <h3 className="tsw-reqSectionTitle">基本信息</h3>
      <div className="tsw-settingsBasicGrid">
        <div className="tsw-settingsIconBlock">
          <span className="tsw-fieldLabel">项目图标</span>
          <span className="tsw-settingsIconPreview" style={{ background: iconStyle.background, color: iconStyle.color }}>
            {projectIcon(project)}
          </span>
        </div>
        <div className="tsw-settingsBasicFields">
          <label className="tsw-field">
            <span>项目名称</span>
            <input value={name} disabled={!canEdit} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="tsw-field">
            <span>项目简介</span>
            <textarea
              rows={3}
              maxLength={200}
              value={description}
              disabled={!canEdit}
              onChange={(e) => setDescription(e.target.value)}
            />
            <em className="tsw-charCount">{description.length} / 200</em>
          </label>
          <label className="tsw-field">
            <span>项目 ID</span>
            <div className="tsw-readonlyField">
              <input value={project.project_code} readOnly />
              <button type="button" className="tsw-linkBtn" onClick={() => void copyCode()}>
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </label>
          <label className="tsw-field">
            <span>创建人</span>
            <input value={creator ? userDisplayName(creator.user_name) : '—'} readOnly />
          </label>
          <label className="tsw-field">
            <span>创建时间</span>
            <input value={formatDateTime(project.created_at)} readOnly />
          </label>
        </div>
      </div>
      {error ? <p className="tsw-error">{error}</p> : null}
      <div className="tsw-reqActionRow" style={{ marginTop: 16 }}>
        {canEdit ? (
          <>
            <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" disabled={saving} onClick={() => void handleSave()}>
              {saving ? '保存中…' : '保存修改'}
            </button>
            <button
              type="button"
              className="tsw-btn"
              disabled={saving}
              onClick={() => {
                setName(project.name);
                setDescription(project.description ?? '');
                setError(null);
              }}
            >
              取消
            </button>
          </>
        ) : (
          <span className="tsw-tag tsw-tagMuted">仅项目管理员可修改</span>
        )}
      </div>
    </div>
  );
}

function FeaturesTab({
  project,
  onLocked,
}: {
  project: Project;
  onLocked: (label: string) => void;
}) {
  const repoLinked = Boolean(project.git_repo_url?.trim());
  const groupLinked = Boolean(project.wps_group_id?.trim() || project.wps_group_name?.trim());

  const items: FeatureCardItem[] = [
    {
      icon: '⟨/⟩',
      title: '代码仓库',
      status: repoLinked ? `已关联 · ${project.git_default_branch || 'main'}` : '未关联',
      description: '关联项目代码仓库，用于研发任务与提交记录。',
      actions: [
        { label: '配置代码仓库' },
        { label: '了解更多', ghost: true },
      ],
    },
    {
      icon: '💬',
      title: '项目群',
      status: groupLinked ? `已关联 · ${project.wps_group_name || project.wps_group_id}` : '未关联',
      description: '关联已有 WPS 群聊，或创建项目群。',
      actions: [{ label: '配置项目群' }],
    },
    {
      icon: '📄',
      title: '在线文档',
      status: '已启用 · 2份文档',
      description: '集中管理与协作项目相关在线文档。',
      actions: [{ label: '管理在线文档' }],
    },
    {
      icon: '✦',
      title: 'AI 能力',
      status: '未启用',
      description: '通过 DSH 提供文档生成、分析与协作能力。',
      actions: [{ label: '配置 AI 能力', disabled: true }],
    },
  ];

  return (
    <div className="tsw-card">
      <h3 className="tsw-reqSectionTitle">功能配置</h3>
      <p className="tsw-muted" style={{ marginTop: 4 }}>
        管理当前项目使用的外部能力与协作入口。
      </p>
      <ul className="tsw-featureConfigList">
        {items.map((item) => (
          <li key={item.title} className="tsw-featureConfigItem">
            <span className="tsw-featureConfigIcon" aria-hidden="true">{item.icon}</span>
            <div className="tsw-featureConfigBody">
              <div className="tsw-featureConfigHead">
                <strong>{item.title}</strong>
                <span className="tsw-muted">{item.status}</span>
              </div>
              <p className="tsw-muted">{item.description}</p>
              <div className="tsw-reqActionRow">
                {item.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.ghost ? 'tsw-btn' : 'tsw-btn tsw-btnOutline'}
                    disabled={action.disabled}
                    onClick={() => onLocked(item.title)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            <span className="tsw-tag tsw-tagWarn">暂未开放</span>
          </li>
        ))}
      </ul>
      <p className="tsw-featureConfigHint">
        未开放功能不会影响需求、研发、测试与 Bug 主流程。
      </p>
    </div>
  );
}

interface FeatureCardItem {
  icon: string;
  title: string;
  status: string;
  description: string;
  actions: { label: string; ghost?: boolean; disabled?: boolean }[];
}

function DangerTab({
  project,
  canEdit,
  onDeleted,
  onLocked,
}: {
  project: Project;
  canEdit: boolean;
  onDeleted: () => void;
  onLocked: (label: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!canEdit) return;
    const confirmed = window.confirm(
      `确定删除项目「${project.name}」？需求、缺陷、成员关系与关联记录将被清除，且不可恢复。`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(project.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="tsw-dangerPage">
      <p className="tsw-dangerIntro">以下操作可能导致数据丢失，请谨慎处理。</p>

      <section className="tsw-dangerCard" data-tone="danger">
        <h3>删除项目</h3>
        <p>删除后，该项目的需求、缺陷、文档关联、成员关系与操作记录将无法访问。</p>
        <ul>
          <li>删除全部需求与缺陷数据</li>
          <li>解除成员关系</li>
          <li>解除仓库 / 文档 / 项目群关联</li>
          <li>此操作不可恢复</li>
        </ul>
        <p className="tsw-dangerBanner">建议删除前先导出项目数据。</p>
        {error ? <p className="tsw-error">{error}</p> : null}
        <button
          type="button"
          className="tsw-btn tsw-btnDangerSolid"
          disabled={!canEdit || deleting}
          onClick={() => void handleDelete()}
        >
          {deleting ? '删除中…' : '删除项目'}
        </button>
        {!canEdit ? <p className="tsw-muted">仅项目管理员可删除项目。</p> : null}
      </section>

      <section className="tsw-dangerCard">
        <h3>项目数据导出</h3>
        <p>导出需求、缺陷、成员与记录，便于备份或迁移。</p>
        <div className="tsw-reqActionRow">
          <button type="button" className="tsw-btn tsw-btnOutline" onClick={() => onLocked('导出项目数据')}>
            导出项目数据
          </button>
          <span className="tsw-tag tsw-tagMuted">暂未开放</span>
        </div>
      </section>
    </div>
  );
}
