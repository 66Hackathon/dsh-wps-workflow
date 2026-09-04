import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import {
  CREATOR_UI_ROLES,
  DEFAULT_MEMBER_ROLE,
  uiRoleLabel,
  userAvatarColor,
  userAvatarLetter,
  userDisplayName,
} from '../../memberRoles';
import type { OrgUser, Project, ProjectMember } from '../../types';
import { addWpsContactsToProject } from '../../wpsContacts';
import { WpsContactsPickerDialog } from '../wps/WpsContactsPickerDialog';
import { CreateStepFooter } from './CreateStepFooter';

interface DraftMember {
  userId: number;
  user: OrgUser;
  isCreator: boolean;
}

interface Props {
  project: Project;
  currentUserId?: number;
  onPrev: () => void;
  onNext: (memberCount: number) => void;
}

function buildDraftFromMembers(
  members: ProjectMember[],
  orgUsers: OrgUser[],
  ownerUserId?: number,
): DraftMember[] {
  const userMap = new Map(orgUsers.map((u) => [u.id, u]));
  const draft = members.map((m) => {
    const user = userMap.get(m.user_id) ?? {
      id: m.user_id,
      name: m.user_name,
      nick_name: '',
      email: '',
    };
    return {
      userId: m.user_id,
      user,
      isCreator: m.user_id === ownerUserId,
    };
  });
  if (draft.length || !ownerUserId) return draft;

  const owner = userMap.get(ownerUserId);
  if (!owner) return draft;
  return [{ userId: ownerUserId, user: owner, isCreator: true }];
}

export function CreateProjectMembersStep({
  project,
  currentUserId,
  onPrev,
  onNext,
}: Props) {
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [draftMembers, setDraftMembers] = useState<DraftMember[]>([]);
  const [ownerUserId, setOwnerUserId] = useState<number | undefined>(
    project.owner_user_id ?? currentUserId,
  );
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContactsPicker, setShowContactsPicker] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([api.listOrgUsers(), api.getProject(project.id)]).then(
      ([usersRes, projectDetail]) => {
        if (cancelled) return;
        const users = usersRes.items ?? [];
        const resolvedOwnerId = projectDetail.owner_user_id ?? currentUserId;
        setOrgUsers(users);
        setOwnerUserId(resolvedOwnerId);
        setDraftMembers(
          buildDraftFromMembers(
            projectDetail.members ?? [],
            users,
            resolvedOwnerId,
          ),
        );
        setDropdownOpen(true);
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载用户失败');
        }
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [project.id, currentUserId]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const draftUserIds = useMemo(
    () => new Set(draftMembers.map((m) => m.userId)),
    [draftMembers],
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgUsers.filter((u) => {
      if (u.id === currentUserId) return false;
      if (!q) return true;
      const name = userDisplayName(u.name, u.nick_name).toLowerCase();
      const email = (u.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [orgUsers, search, currentUserId]);

  const reloadUsers = () => {
    setLoading(true);
    setError(null);
    void api.listOrgUsers().then(
      (res) => {
        setOrgUsers(res.items ?? []);
        setDropdownOpen(true);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : '加载用户失败');
      },
    ).finally(() => setLoading(false));
  };

  const selectedExtraCount = draftMembers.filter((m) => !m.isCreator).length;

  const toggleUser = (user: OrgUser) => {
    if (draftUserIds.has(user.id)) {
      setDraftMembers((prev) => prev.filter((m) => m.userId !== user.id || m.isCreator));
      return;
    }
    setDraftMembers((prev) => [
      ...prev,
      { userId: user.id, user, isCreator: false },
    ]);
  };

  const removeMember = (userId: number) => {
    setDraftMembers((prev) => prev.filter((m) => m.userId !== userId || m.isCreator));
  };

  const syncMembers = async () => {
    if (!draftMembers.length) {
      throw new Error('成员列表尚未加载完成，请稍后再试');
    }

    const remote = await api.listProjectMembers(project.id);
    const remoteMap = new Map(remote.items.map((m) => [m.user_id, m]));
    const draftMap = new Map(draftMembers.map((m) => [m.userId, m]));
    const protectedOwnerId = ownerUserId ?? project.owner_user_id ?? currentUserId;

    for (const draft of draftMembers) {
      const existing = remoteMap.get(draft.userId);
      if (!existing && !draft.isCreator) {
        await api.addProjectMember(project.id, {
          user_id: draft.userId,
          role_codes: [DEFAULT_MEMBER_ROLE],
        });
      }
    }

    for (const remoteMember of remote.items) {
      if (protectedOwnerId != null && remoteMember.user_id === protectedOwnerId) continue;
      if (!draftMap.has(remoteMember.user_id)) {
        await api.removeProjectMember(project.id, remoteMember.id);
      }
    }
  };

  const handleContinue = async (skip = false) => {
    if (skip) {
      onNext(draftMembers.length);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await syncMembers();
      onNext(draftMembers.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存成员失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tsw-createWizardLayout">
      <div className="tsw-createWizardMain">
        <div className="tsw-createForm tsw-createWizardCard">
          <h3 className="tsw-createWizardHeading">添加项目成员</h3>
          <div className="tsw-createWizardHeadingRow" style={{ marginTop: -4, marginBottom: 12 }}>
            <p className="tsw-muted tsw-createWizardSub" style={{ margin: 0 }}>
              从系统用户或 WPS 通讯录中选择成员加入项目。
            </p>
            <button
              type="button"
              className="tsw-btn tsw-btnPrimary tsw-btnSolid"
              onClick={() => setShowContactsPicker(true)}
              disabled={loading || submitting}
            >
              从通讯录选择
            </button>
          </div>

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
                disabled={loading}
              />
            </div>
            {loading ? (
              <p className="tsw-muted tsw-memberSearchEmpty">正在加载系统用户…</p>
            ) : null}
            {dropdownOpen && !loading ? (
              <div className="tsw-memberSearchDropdown">
                {filteredUsers.length ? filteredUsers.map((u) => {
                  const checked = draftUserIds.has(u.id);
                  const label = userDisplayName(u.name, u.nick_name);
                  return (
                    <label key={u.id} className="tsw-memberSearchOption">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUser(u)}
                      />
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
                    </label>
                  );
                }) : (
                  <p className="tsw-muted tsw-memberSearchEmpty">未找到匹配用户</p>
                )}
                <p className="tsw-memberSearchCount">
                  已选择 {selectedExtraCount} 人
                </p>
              </div>
            ) : null}
          </div>

          <div className="tsw-memberTableWrap">
            <table className="tsw-memberTable">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>项目角色</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {draftMembers.map((member) => {
                  const label = userDisplayName(member.user.name, member.user.nick_name);
                  return (
                    <tr key={member.userId}>
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
                            {member.userId === currentUserId ? (
                              <span className="tsw-muted">（当前用户）</span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td>
                        {member.isCreator ? (
                          <div className="tsw-roleTagGroup">
                            {CREATOR_UI_ROLES.map((role) => (
                              <span key={role} className="tsw-roleTag">{uiRoleLabel(role)}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="tsw-tag">{uiRoleLabel(DEFAULT_MEMBER_ROLE)}</span>
                        )}
                      </td>
                      <td>
                        {member.isCreator ? (
                          <span className="tsw-muted">创建者</span>
                        ) : (
                          <button
                            type="button"
                            className="tsw-iconBtn"
                            aria-label={`移除 ${label}`}
                            onClick={() => removeMember(member.userId)}
                          >
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!draftMembers.length && !loading ? (
              <p className="tsw-muted tsw-memberTableEmpty">暂无成员</p>
            ) : null}
          </div>

          {error ? (
            <p className="tsw-error">
              {error}
              {' '}
              <button type="button" className="tsw-btn tsw-btnLink" onClick={reloadUsers}>
                重试
              </button>
            </p>
          ) : null}

          <CreateStepFooter
            onPrev={onPrev}
            onSkip={() => void handleContinue(true)}
            onNext={() => void handleContinue(false)}
            nextLoading={submitting}
            nextDisabled={loading}
          />
        </div>
      </div>

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard">
          <div className="tsw-createAsideHead">
            <span className="tsw-createAsideIcon" aria-hidden="true">👥</span>
            <strong>成员与角色</strong>
          </div>
          <ul className="tsw-createAsideList">
            <li>创建者自动成为项目管理员</li>
            <li>其他成员默认为普通项目成员</li>
            <li>需求创建者为产品负责人，创建时指定研发与测试负责人</li>
          </ul>
        </div>
      </aside>

      {showContactsPicker ? (
        <WpsContactsPickerDialog
          multiple
          onClose={() => setShowContactsPicker(false)}
          onConfirm={async (contacts) => {
            await addWpsContactsToProject(project.id, contacts);
            const usersRes = await api.listOrgUsers();
            setOrgUsers(usersRes.items ?? []);
            const remote = await api.listProjectMembers(project.id);
            setDraftMembers(
              buildDraftFromMembers(
                remote.items ?? [],
                usersRes.items ?? [],
                ownerUserId,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
