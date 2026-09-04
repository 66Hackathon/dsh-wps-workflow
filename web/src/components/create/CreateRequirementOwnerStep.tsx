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
import {
  REQUIREMENT_DEV_DIRECTION_OPTIONS,
  type RequirementDevDirection,
  type RequirementDraft,
} from '../../requirementCreate';
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
  const [developerSearch, setDeveloperSearch] = useState('');
  const [testerSearch, setTesterSearch] = useState('');
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [testerOpen, setTesterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const developerRef = useRef<HTMLDivElement>(null);
  const testerRef = useRef<HTMLDivElement>(null);

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
      if (!developerRef.current?.contains(event.target as Node)) setDeveloperOpen(false);
      if (!testerRef.current?.contains(event.target as Node)) setTesterOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedDeveloper = useMemo(
    () => members.find((m) => m.user_id === draft.developerUserId) ?? null,
    [members, draft.developerUserId],
  );
  const selectedTester = useMemo(
    () => members.find((m) => m.user_id === draft.testerUserId) ?? null,
    [members, draft.testerUserId],
  );

  const filterMembers = (search: string) => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.user_name.toLowerCase().includes(q));
  };

  const setDirection = (value: RequirementDevDirection) => {
    onChange({ ...draft, devDirection: value });
  };

  const handleNext = () => {
    if (!draft.devDirection) {
      setError('请选择研发方向');
      return;
    }
    if (!draft.developerUserId) {
      setError('请指定研发负责人');
      return;
    }
    if (!draft.testerUserId) {
      setError('请指定测试负责人');
      return;
    }
    setError(null);
    onNext();
  };

  const directionLabel = draft.devDirection === 'BACKEND' ? '后端' : '前端';

  return (
    <div className="tsw-createWizardLayout">
      <div className="tsw-createWizardMain">
        <div className="tsw-createForm tsw-createWizardCard tsw-createFormFill">
          <h3 className="tsw-createWizardHeading">研发方向与负责人</h3>
          <p className="tsw-createWizardSub tsw-muted">
            一个需求对应一名研发负责人。产品、研发、测试可以由同一人兼任。请先选择研发方向，再指定负责人。创建者即为产品负责人。
          </p>

          <div className="tsw-formRow">
            <span className="tsw-fieldLabel">
              研发方向
              <span className="tsw-required"> *</span>
            </span>
            <div className="tsw-reqDirectionChecks" role="radiogroup" aria-label="研发方向">
              {REQUIREMENT_DEV_DIRECTION_OPTIONS.map((opt) => {
                const selected = draft.devDirection === opt.value;
                return (
                  <label key={opt.value} className="tsw-reqDirectionCheck">
                    <input
                      type="radio"
                      name="req-dev-direction"
                      checked={selected}
                      onChange={() => setDirection(opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <PersonPicker
            label={`${directionLabel}研发负责人`}
            required
            fieldId="req-developer-search"
            selected={selectedDeveloper}
            search={developerSearch}
            open={developerOpen}
            loading={loading}
            members={filterMembers(developerSearch)}
            selectedUserId={draft.developerUserId}
            wrapRef={developerRef}
            onSearch={(value) => {
              setDeveloperSearch(value);
              setDeveloperOpen(true);
            }}
            onFocus={() => setDeveloperOpen(true)}
            onSelect={(member) => {
              onChange({ ...draft, developerUserId: member.user_id });
              setDeveloperSearch('');
              setDeveloperOpen(false);
            }}
            onClear={() => {
              onChange({ ...draft, developerUserId: undefined });
              setDeveloperOpen(true);
            }}
          />

          <PersonPicker
            label="测试负责人"
            required
            fieldId="req-tester-search"
            selected={selectedTester}
            search={testerSearch}
            open={testerOpen}
            loading={loading}
            members={filterMembers(testerSearch)}
            selectedUserId={draft.testerUserId}
            wrapRef={testerRef}
            onSearch={(value) => {
              setTesterSearch(value);
              setTesterOpen(true);
            }}
            onFocus={() => setTesterOpen(true)}
            onSelect={(member) => {
              onChange({ ...draft, testerUserId: member.user_id });
              setTesterSearch('');
              setTesterOpen(false);
            }}
            onClear={() => {
              onChange({ ...draft, testerUserId: undefined });
              setTesterOpen(true);
            }}
          />

          {error ? <p className="tsw-error">{error}</p> : null}

          <CreateStepFooter
            onPrev={onPrev}
            onNext={handleNext}
            showSkip={false}
          />
        </div>
      </div>
    </div>
  );
}

function PersonPicker({
  label,
  required,
  fieldId,
  selected,
  search,
  open,
  loading,
  members,
  selectedUserId,
  wrapRef,
  onSearch,
  onFocus,
  onSelect,
  onClear,
}: {
  label: string;
  required?: boolean;
  fieldId: string;
  selected: ProjectMember | null;
  search: string;
  open: boolean;
  loading: boolean;
  members: ProjectMember[];
  selectedUserId?: number;
  wrapRef: React.Ref<HTMLDivElement>;
  onSearch: (value: string) => void;
  onFocus: () => void;
  onSelect: (member: ProjectMember) => void;
  onClear: () => void;
}) {
  return (
    <div className="tsw-formRow">
      <label className="tsw-fieldLabel" htmlFor={fieldId}>
        {label}
        {required ? <span className="tsw-required"> *</span> : null}
      </label>

      {selected ? (
        <div className="tsw-reqOwnerSelected">
          <span
            className="tsw-userAvatar"
            style={{ background: userAvatarColor(selected.user_name) }}
            aria-hidden="true"
          >
            {userAvatarLetter(selected.user_name)}
          </span>
          <span className="tsw-reqOwnerSelectedMeta">
            <strong>{userDisplayName(selected.user_name)}</strong>
            <span className="tsw-reqRoleTags">
              {memberRoleTags(selected).map((tag) => (
                <span key={tag} className="tsw-reqRoleTag">{tag}</span>
              ))}
            </span>
          </span>
          <button type="button" className="tsw-linkBtn" onClick={onClear}>
            更换
          </button>
        </div>
      ) : null}

      <div className="tsw-memberSearchWrap" ref={wrapRef}>
        <div className="tsw-memberSearchBox">
          <span className="tsw-memberSearchIcon" aria-hidden="true">🔍</span>
          <input
            id={fieldId}
            className="tsw-memberSearchInput"
            placeholder="从当前项目成员中选择"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onFocus={onFocus}
            disabled={loading}
          />
        </div>
        {loading ? (
          <p className="tsw-muted tsw-memberSearchEmpty">正在加载项目成员…</p>
        ) : null}
        {open && !loading ? (
          <div className="tsw-memberSearchDropdown tsw-memberSearchDropdownLg">
            {members.length ? members.map((member) => {
              const name = userDisplayName(member.user_name);
              const isSelected = selectedUserId === member.user_id;
              return (
                <button
                  key={member.id}
                  type="button"
                  className="tsw-reqMemberOption"
                  data-selected={isSelected ? 'true' : 'false'}
                  onClick={() => onSelect(member)}
                >
                  <span
                    className="tsw-memberAvatar"
                    style={{ background: userAvatarColor(member.user_name) }}
                  >
                    {userAvatarLetter(name)}
                  </span>
                  <span className="tsw-memberSearchOptionText">
                    <strong>{name}</strong>
                    <span className="tsw-reqRoleTags">
                      {memberRoleTags(member).map((tag) => (
                        <span key={tag} className="tsw-reqRoleTag">{tag}</span>
                      ))}
                    </span>
                  </span>
                  {isSelected ? <span className="tsw-ownerPickerCheck">✓</span> : null}
                </button>
              );
            }) : (
              <p className="tsw-muted tsw-memberSearchEmpty">未找到匹配成员</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
