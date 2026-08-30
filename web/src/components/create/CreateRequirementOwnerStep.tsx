import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import {
  memberRoleCodes,
  uiRoleLabel,
  userAvatarColor,
  userAvatarLetter,
  userDisplayName,
} from '../../memberRoles';
import type { ProjectMember } from '../../types';
import type { RequirementDraft } from '../../requirementCreate';
import { CreateStepFooter } from './CreateStepFooter';

interface Props {
  projectId: number;
  draft: RequirementDraft;
  onChange: (next: RequirementDraft) => void;
  onPrev: () => void;
  onNext: () => void;
}

function memberRoleTags(member: ProjectMember): string[] {
  const tags = memberRoleCodes(member).map(uiRoleLabel);
  if (tags.length) return tags;
  return member.role_code === 'PROJECT_ADMIN' ? ['项目管理员'] : ['项目成员'];
}

export function CreateRequirementOwnerStep({
  projectId,
  draft,
  onChange,
  onPrev,
  onNext,
}: Props) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [watcherSearch, setWatcherSearch] = useState('');
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [watcherDropdownOpen, setWatcherDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ownerRef = useRef<HTMLDivElement>(null);
  const watcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.listProjectMembers(projectId).then(
      (res) => {
        if (!cancelled) setMembers(res.items ?? []);
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载成员失败');
        }
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!ownerRef.current?.contains(event.target as Node)) {
        setOwnerDropdownOpen(false);
      }
      if (!watcherRef.current?.contains(event.target as Node)) {
        setWatcherDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedOwner = useMemo(
    () => members.find((m) => m.user_id === draft.productOwnerUserId) ?? null,
    [members, draft.productOwnerUserId],
  );

  const watcherIds = draft.watcherUserIds ?? [];

  const filteredOwnerMembers = useMemo(() => {
    const q = ownerSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (!q) return true;
      return m.user_name.toLowerCase().includes(q);
    });
  }, [members, ownerSearch]);

  const filteredWatcherMembers = useMemo(() => {
    const q = watcherSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (watcherIds.includes(m.user_id)) return false;
      if (m.user_id === draft.productOwnerUserId) return false;
      if (!q) return true;
      return m.user_name.toLowerCase().includes(q);
    });
  }, [members, watcherSearch, watcherIds, draft.productOwnerUserId]);

  const watcherMembers = useMemo(
    () => members.filter((m) => watcherIds.includes(m.user_id)),
    [members, watcherIds],
  );

  const selectOwner = (member: ProjectMember) => {
    const nextWatchers = watcherIds.filter((id) => id !== member.user_id);
    onChange({
      ...draft,
      productOwnerUserId: member.user_id,
      watcherUserIds: nextWatchers,
    });
    setOwnerSearch('');
    setOwnerDropdownOpen(false);
  };

  const addWatcher = (member: ProjectMember) => {
    if (watcherIds.includes(member.user_id)) return;
    onChange({
      ...draft,
      watcherUserIds: [...watcherIds, member.user_id],
    });
    setWatcherSearch('');
  };

  const removeWatcher = (userId: number) => {
    onChange({
      ...draft,
      watcherUserIds: watcherIds.filter((id) => id !== userId),
    });
  };

  const handleNext = (skipOwner = false) => {
    if (!skipOwner && !draft.productOwnerUserId) {
      setError('请选择产品负责人');
      return;
    }
    setError(null);
    onNext();
  };

  return (
    <div className="tsw-createWizardLayout tsw-createWizardLayoutWide">
      <div className="tsw-createWizardMain">
        <div className="tsw-createForm tsw-createWizardCard tsw-createFormFill">
          <h3 className="tsw-createWizardHeading">设置负责人和关注者</h3>

          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="req-owner-search">
              产品负责人 <span className="tsw-required">*</span>
            </label>
            <p className="tsw-fieldDesc">
              负责需求规格、产品方案与验收标准，进入「产品设计中」阶段。
            </p>

            {selectedOwner ? (
              <div className="tsw-reqOwnerSelected">
                <span
                  className="tsw-userAvatar"
                  style={{ background: userAvatarColor(selectedOwner.user_name) }}
                  aria-hidden="true"
                >
                  {userAvatarLetter(selectedOwner.user_name)}
                </span>
                <span className="tsw-reqOwnerSelectedMeta">
                  <strong>{userDisplayName(selectedOwner.user_name)}</strong>
                  <span className="tsw-reqRoleTags">
                    {memberRoleTags(selectedOwner).map((tag) => (
                      <span key={tag} className="tsw-reqRoleTag">{tag}</span>
                    ))}
                  </span>
                </span>
                <button
                  type="button"
                  className="tsw-linkBtn"
                  onClick={() => {
                    onChange({ ...draft, productOwnerUserId: undefined });
                    setOwnerDropdownOpen(true);
                  }}
                >
                  更换
                </button>
              </div>
            ) : null}

            <div className="tsw-memberSearchWrap" ref={ownerRef}>
              <div className="tsw-memberSearchBox">
                <span className="tsw-memberSearchIcon" aria-hidden="true">🔍</span>
                <input
                  id="req-owner-search"
                  className="tsw-memberSearchInput"
                  placeholder="仅可选择当前项目成员"
                  value={ownerSearch}
                  onChange={(e) => {
                    setOwnerSearch(e.target.value);
                    setOwnerDropdownOpen(true);
                  }}
                  onFocus={() => setOwnerDropdownOpen(true)}
                  disabled={loading}
                />
              </div>
              {loading ? (
                <p className="tsw-muted tsw-memberSearchEmpty">正在加载项目成员…</p>
              ) : null}
              {ownerDropdownOpen && !loading ? (
                <div className="tsw-memberSearchDropdown tsw-memberSearchDropdownLg">
                  {filteredOwnerMembers.length ? filteredOwnerMembers.map((member) => {
                    const label = userDisplayName(member.user_name);
                    const selected = draft.productOwnerUserId === member.user_id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className="tsw-reqMemberOption"
                        data-selected={selected ? 'true' : 'false'}
                        onClick={() => selectOwner(member)}
                      >
                        <span
                          className="tsw-memberAvatar"
                          style={{ background: userAvatarColor(member.user_name) }}
                        >
                          {userAvatarLetter(label)}
                        </span>
                        <span className="tsw-memberSearchOptionText">
                          <strong>{label}</strong>
                          <span className="tsw-reqRoleTags">
                            {memberRoleTags(member).map((tag) => (
                              <span key={tag} className="tsw-reqRoleTag">{tag}</span>
                            ))}
                          </span>
                        </span>
                        {selected ? <span className="tsw-ownerPickerCheck">✓</span> : null}
                      </button>
                    );
                  }) : (
                    <p className="tsw-muted tsw-memberSearchEmpty">未找到匹配成员</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="req-watcher-search">
              需求关注者 <span className="tsw-optional">（可选）</span>
            </label>
            <p className="tsw-fieldDesc">
              关注者可接收需求状态变更通知，不参与审批流转。
            </p>

            <div className="tsw-memberSearchWrap" ref={watcherRef}>
              <div className="tsw-reqWatcherInput">
                {watcherMembers.map((member) => (
                  <span key={member.id} className="tsw-reqWatcherTag">
                    {userDisplayName(member.user_name)}
                    <button
                      type="button"
                      className="tsw-reqWatcherTagRemove"
                      aria-label={`移除 ${member.user_name}`}
                      onClick={() => removeWatcher(member.user_id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="req-watcher-search"
                  className="tsw-reqWatcherSearch"
                  placeholder={watcherMembers.length ? '继续搜索添加' : '搜索项目成员'}
                  value={watcherSearch}
                  onChange={(e) => {
                    setWatcherSearch(e.target.value);
                    setWatcherDropdownOpen(true);
                  }}
                  onFocus={() => setWatcherDropdownOpen(true)}
                  disabled={loading}
                />
              </div>
              {watcherDropdownOpen && !loading && filteredWatcherMembers.length ? (
                <div className="tsw-memberSearchDropdown tsw-memberSearchDropdownLg">
                  {filteredWatcherMembers.map((member) => {
                    const label = userDisplayName(member.user_name);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className="tsw-reqMemberOption"
                        onClick={() => addWatcher(member)}
                      >
                        <span
                          className="tsw-memberAvatar"
                          style={{ background: userAvatarColor(member.user_name) }}
                        >
                          {userAvatarLetter(label)}
                        </span>
                        <span className="tsw-memberSearchOptionText">
                          <strong>{label}</strong>
                          <span className="tsw-reqRoleTags">
                            {memberRoleTags(member).map((tag) => (
                              <span key={tag} className="tsw-reqRoleTag">{tag}</span>
                            ))}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="tsw-reqInfoCallout">
            <span className="tsw-reqInfoCalloutIcon" aria-hidden="true">i</span>
            <p>测试负责人将在研发分配阶段指定，当前无需设置。</p>
          </div>

          {error ? <p className="tsw-error">{error}</p> : null}

          <CreateStepFooter
            onPrev={onPrev}
            skipLabel="稍后设置负责人"
            onSkip={() => handleNext(true)}
            onNext={() => handleNext(false)}
            showSkip
          />
        </div>
      </div>

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard tsw-createAsideCardFill">
          <div className="tsw-createAsideHead">
            <span className="tsw-createAsideIcon" aria-hidden="true">i</span>
            <strong>负责人规则</strong>
          </div>
          <ul className="tsw-createAsideList">
            <li>产品负责人为必填项，负责需求从创建到验收的全流程</li>
            <li>关注者可选，仅接收通知不参与审批</li>
            <li>研发、测试负责人在研发分配阶段指定，且与产品负责人不可重复</li>
            <li>同一需求中，每人只能承担一种职能角色</li>
            <li>负责人须为当前项目成员</li>
            <li>负责人变更将记录在操作日志</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
