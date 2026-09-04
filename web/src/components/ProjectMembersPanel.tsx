import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import {
  DEFAULT_MEMBER_ROLE,
  isProjectAdmin,
  simpleProjectRoleLabel,
  userAvatarColor,
  userAvatarLetter,
  userDisplayName,
} from '../memberRoles';
import type { OrgUser, ProjectMember } from '../types';
import { addWpsContactsToProject } from '../wpsContacts';
import { WpsContactsPickerDialog } from './wps/WpsContactsPickerDialog';

interface Props {
  projectId: number;
  members: ProjectMember[];
  ownerUserId?: number;
  currentUserId?: number;
  canManage?: boolean;
  compact?: boolean;
  onMembersChange?: (members: ProjectMember[]) => void;
}

type PanelDialog =
  | { kind: 'add' }
  | { kind: 'edit'; member: ProjectMember }
  | null;

function displayUserName(user: OrgUser): string {
  return userDisplayName(user.name, user.nick_name);
}

function memberLabel(member: ProjectMember): string {
  return member.user_name;
}

function isCreatorMember(member: ProjectMember, ownerUserId?: number): boolean {
  return ownerUserId != null && member.user_id === ownerUserId;
}

function canRemoveMember(
  member: ProjectMember,
  ownerUserId: number | undefined,
  currentUserId: number | undefined,
): boolean {
  if (isCreatorMember(member, ownerUserId)) return false;
  if (member.user_id === currentUserId) return false;
  return !isProjectAdmin(member);
}

interface DialogShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

function DialogShell({ title, subtitle, onClose, children, actions }: DialogShellProps) {
  return (
    <div
      className="tsw-dialogBackdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="tsw-memberDialog" role="dialog" aria-modal="true" aria-label={title}>
        <button
          type="button"
          className="tsw-profileDialogClose"
          aria-label="关闭"
          onClick={onClose}
        >
          ×
        </button>
        <h3 className="tsw-memberDialogTitle">{title}</h3>
        {subtitle ? <p className="tsw-muted tsw-memberDialogSub">{subtitle}</p> : null}
        <div className="tsw-memberDialogBody">{children}</div>
        {actions ? <div className="tsw-memberDialogActions">{actions}</div> : null}
      </div>
    </div>
  );
}

interface AddMemberDialogProps {
  projectId: number;
  memberUserIds: Set<number>;
  onClose: () => void;
  onAdded: () => Promise<void>;
}

function AddMemberDialog({ projectId, memberUserIds, onClose, onAdded }: AddMemberDialogProps) {
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(true);
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContactsPicker, setShowContactsPicker] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    void api.listOrgUsers().then(
      (res) => { if (!cancelled) setOrgUsers(res.items ?? []); },
      () => { if (!cancelled) setOrgUsers([]); },
    ).finally(() => { if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const availableUsers = useMemo(
    () => orgUsers.filter((u) => !memberUserIds.has(u.id)),
    [orgUsers, memberUserIds],
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availableUsers.filter((u) => {
      if (!q) return true;
      const name = displayUserName(u).toLowerCase();
      const email = (u.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [availableUsers, search]);

  const handleAdd = async () => {
    if (!selectedUser) {
      setError('请选择要添加的成员');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.addProjectMember(projectId, {
        user_id: selectedUser.id,
        role_codes: [DEFAULT_MEMBER_ROLE],
      });
      await onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedLabel = selectedUser ? displayUserName(selectedUser) : '';

  return (
    <>
    <DialogShell
      title="新增成员"
      subtitle="从系统用户或 WPS 通讯录中选择成员加入项目，新增成员默认为普通成员。"
      onClose={onClose}
      actions={(
        <>
          <button
            type="button"
            className="tsw-btn"
            onClick={() => setShowContactsPicker(true)}
            disabled={submitting}
          >
            从通讯录选择
          </button>
          <button type="button" className="tsw-btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tsw-btn tsw-btnPrimary tsw-btnSolid"
            onClick={() => void handleAdd()}
            disabled={submitting || !selectedUser}
          >
            {submitting ? '添加中…' : '确认添加'}
          </button>
        </>
      )}
    >
      <div className="tsw-memberSearchWrap" ref={searchRef}>
        <div className="tsw-memberSearchBox">
          <span className="tsw-memberSearchIcon" aria-hidden="true">🔍</span>
          <input
            className="tsw-memberSearchInput"
            placeholder="搜索姓名或邮箱"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            disabled={loadingUsers}
          />
        </div>
        {loadingUsers ? (
          <p className="tsw-muted tsw-memberSearchEmpty">正在加载系统用户…</p>
        ) : null}
        {dropdownOpen && !loadingUsers ? (
          <div className="tsw-memberSearchDropdown">
            {filteredUsers.length ? filteredUsers.map((u) => {
              const label = displayUserName(u);
              const active = selectedUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  className={`tsw-memberSearchOption tsw-memberSearchOptionBtn${active ? ' tsw-memberSearchOptionActive' : ''}`}
                  onClick={() => {
                    setSelectedUser(u);
                    setDropdownOpen(false);
                    setError(null);
                  }}
                >
                  <span
                    className="tsw-memberAvatar"
                    style={{ background: userAvatarColor(label) }}
                  >
                    {userAvatarLetter(label)}
                  </span>
                  <span className="tsw-memberSearchOptionText">
                    <strong>{label}</strong>
                    <span className="tsw-muted">{u.email || `${u.id}@teamspace.local`}</span>
                  </span>
                </button>
              );
            }) : (
              <p className="tsw-muted tsw-memberSearchEmpty">
                {availableUsers.length ? '未找到匹配用户' : '暂无可添加用户'}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {selectedUser ? (
        <div className="tsw-memberDialogPreview">
          <span
            className="tsw-memberAvatar tsw-memberAvatarLg"
            style={{ background: userAvatarColor(selectedLabel) }}
          >
            {userAvatarLetter(selectedLabel)}
          </span>
          <div>
            <strong>{selectedLabel}</strong>
            <p className="tsw-muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
              {selectedUser.email || `${selectedUser.id}@teamspace.local`}
            </p>
            <span className="tsw-tag">普通成员</span>
          </div>
        </div>
      ) : (
        <p className="tsw-muted tsw-memberDialogHint">请搜索并选择一名用户</p>
      )}

      {error ? <p className="tsw-error">{error}</p> : null}
    </DialogShell>

    {showContactsPicker ? (
      <WpsContactsPickerDialog
        multiple
        onClose={() => setShowContactsPicker(false)}
        onConfirm={async (contacts) => {
          await addWpsContactsToProject(projectId, contacts);
          await onAdded();
          onClose();
        }}
      />
    ) : null}
    </>
  );
}

interface EditMemberDialogProps {
  member: ProjectMember;
  ownerUserId?: number;
  currentUserId?: number;
  canManage: boolean;
  projectId: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

function EditMemberDialog({
  member,
  ownerUserId,
  currentUserId,
  canManage,
  projectId,
  onClose,
  onChanged,
}: EditMemberDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = memberLabel(member);
  const creator = isCreatorMember(member, ownerUserId);
  const roleLabel = simpleProjectRoleLabel(member);
  const removable = canManage && canRemoveMember(member, ownerUserId, currentUserId);

  const handleRemove = async () => {
    if (!window.confirm(`确定将「${label}」移出项目？`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.removeProjectMember(projectId, member.id);
      await onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell
      title="成员信息"
      onClose={onClose}
      actions={(
        <>
          {removable ? (
            <button
              type="button"
              className="tsw-btn tsw-btnDanger"
              onClick={() => void handleRemove()}
              disabled={submitting}
            >
              {submitting ? '处理中…' : '移出项目'}
            </button>
          ) : null}
          <button type="button" className="tsw-btn" onClick={onClose} disabled={submitting}>
            关闭
          </button>
        </>
      )}
    >
      <div className="tsw-memberDialogPreview">
        <span
          className="tsw-memberAvatar tsw-memberAvatarLg"
          style={{ background: userAvatarColor(label) }}
        >
          {userAvatarLetter(label)}
        </span>
        <div>
          <div className="tsw-memberDialogPreviewRow">
            <strong>{label}</strong>
            {member.user_id === currentUserId ? (
              <span className="tsw-muted">（我）</span>
            ) : null}
            <span className={`tsw-tag${roleLabel === '管理员' ? '' : ' tsw-tagMuted'}`}>
              {roleLabel}
            </span>
          </div>
          {creator ? (
            <p className="tsw-muted" style={{ margin: '8px 0 0', fontSize: '13px' }}>
              项目创建者，角色不可修改。
            </p>
          ) : null}
        </div>
      </div>
      {error ? <p className="tsw-error">{error}</p> : null}
    </DialogShell>
  );
}

export function ProjectMembersPanel({
  projectId,
  members,
  ownerUserId,
  currentUserId,
  canManage = false,
  compact = false,
  onMembersChange,
}: Props) {
  const [dialog, setDialog] = useState<PanelDialog>(null);
  const [memberQuery, setMemberQuery] = useState('');

  const memberUserIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members],
  );

  const visibleMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.user_name.toLowerCase().includes(q));
  }, [members, memberQuery]);

  const refreshMembers = async (): Promise<void> => {
    const res = await api.listProjectMembers(projectId);
    onMembersChange?.(res.items ?? []);
  };

  return (
    <div className={compact ? 'tsw-membersPanelCompact' : 'tsw-membersPanel'}>
      <div className="tsw-membersPanelHeader">
        <h3 className="tsw-membersPanelTitle">项目成员</h3>
        <div className="tsw-membersPanelHeaderActions">
          {canManage ? (
            <button
              type="button"
              className="tsw-btn tsw-btnPrimary tsw-btnSolid tsw-membersPanelAddBtn"
              onClick={() => setDialog({ kind: 'add' })}
            >
              + 添加成员
            </button>
          ) : null}
        </div>
      </div>

      <div className="tsw-searchWrap" style={{ marginBottom: 12 }}>
        <span className="tsw-searchIcon" aria-hidden="true">🔍</span>
        <input
          type="search"
          className="tsw-searchInput"
          placeholder="搜索成员姓名"
          value={memberQuery}
          onChange={(e) => setMemberQuery(e.target.value)}
        />
      </div>

      {!canManage ? (
        <p className="tsw-muted tsw-membersPanelHint">
          仅项目管理员可添加或移除成员。
        </p>
      ) : null}

      <div className="tsw-memberTableWrap">
        <table className="tsw-memberTable tsw-memberTablePanel">
          <thead>
            <tr>
              <th>成员</th>
              <th>项目角色</th>
              <th>身份</th>
              <th>加入时间</th>
              {canManage ? <th className="tsw-memberTableActionsCol">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((m) => {
              const label = memberLabel(m);
              const roleLabel = simpleProjectRoleLabel(m);
              const creator = isCreatorMember(m, ownerUserId);
              return (
                <tr key={m.id}>
                  <td>
                    <div className="tsw-memberTableUser">
                      <span
                        className="tsw-memberAvatar"
                        style={{ background: userAvatarColor(label) }}
                      >
                        {userAvatarLetter(label)}
                      </span>
                      <span>
                        {label}
                        {m.user_id === currentUserId ? (
                          <span className="tsw-muted">（我）</span>
                        ) : null}
                        <div className="tsw-muted" style={{ fontSize: 12 }}>WPS企业用户</div>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`tsw-tag${roleLabel === '管理员' ? '' : ' tsw-tagMuted'}`}>
                      {roleLabel === '管理员' ? '项目管理员' : '普通成员'}
                    </span>
                  </td>
                  <td>{creator ? '创建者' : '项目成员'}</td>
                  <td className="tsw-muted">{m.joined_at || '—'}</td>
                  {canManage ? (
                    <td className="tsw-memberTableActionsCol">
                      <button
                        type="button"
                        className="tsw-linkBtn"
                        onClick={() => setDialog({ kind: 'edit', member: m })}
                      >
                        {creator ? '查看' : '修改角色'}
                      </button>
                      {canRemoveMember(m, ownerUserId, currentUserId) ? (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="tsw-linkBtn"
                            onClick={() => setDialog({ kind: 'edit', member: m })}
                          >
                            移除
                          </button>
                        </>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visibleMembers.length ? (
          <p className="tsw-muted tsw-memberTableEmpty">暂无成员</p>
        ) : null}
      </div>

      {dialog?.kind === 'add' ? (
        <AddMemberDialog
          projectId={projectId}
          memberUserIds={memberUserIds}
          onClose={() => setDialog(null)}
          onAdded={refreshMembers}
        />
      ) : null}

      {dialog?.kind === 'edit' ? (
        <EditMemberDialog
          member={dialog.member}
          ownerUserId={ownerUserId}
          currentUserId={currentUserId}
          canManage={canManage}
          projectId={projectId}
          onClose={() => setDialog(null)}
          onChanged={refreshMembers}
        />
      ) : null}
    </div>
  );
}
