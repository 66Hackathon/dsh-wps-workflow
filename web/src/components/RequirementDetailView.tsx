import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { userAvatarColor, userAvatarLetter, userDisplayName } from '../memberRoles';
import {
  isRequirementProductOwner,
  PRODUCT_OWNER_ONLY_HINT,
} from '../requirementPermissions';
import { PRIORITY_LABELS } from '../requirementCreate';
import {
  excludeUserIdsForDevAssignPicker,
  requirementRoleDraftFromRequirement,
  UNIQUE_REQUIREMENT_ROLE_HINT,
  validateUniqueRequirementRoles,
} from '../requirementRoles';
import {
  REQUIREMENT_PHASE_BADGE,
  REQUIREMENT_PHASE_STEPS,
  isRequirementStepReachable,
  resolveRequirementPhaseIndex,
  resolveRequirementPhaseStates,
} from '../requirementPhase';
import type { Project, ProjectMember, Requirement, RequirementTimeline } from '../types';
import { FeatureLockedDialog } from './FeatureLockedDialog';
import { DevPhaseViewBadge, RequirementDevPhaseAside, RequirementDevPhaseMain, useDevPhaseViewContext } from './RequirementDevPhasePanel';
import { RequirementPhaseHistoryPanel } from './RequirementPhaseHistoryPanel';
import {
  RequirementTestPhaseAside,
  RequirementTestPhaseMain,
  TestPhaseProvider,
  TestPhaseViewBadge,
  useTestPhaseViewContext,
} from './RequirementTestPhasePanel';
import {
  RequirementBugFixWorkPanel,
  RequirementBugFixingPanel,
} from './RequirementBugFixPanel';
import { RequirementAcceptancePanel } from './RequirementAcceptancePanel';

interface Props {
  project: Project;
  requirement: Requirement;
  members: ProjectMember[];
  currentUserId?: number;
  onBackToList: () => void;
  onRequirementUpdated: (requirement: Requirement) => void;
  onOpenRequirement?: (requirementId: number) => void;
}

interface DemoDocument {
  id: string;
  title: string;
  tags: { label: string; tone: 'blue' | 'yellow' | 'muted' }[];
  creator: string;
  updatedAt: string;
}

interface DemoMaterial {
  id: string;
  title: string;
  subtitle: string;
}

const DEMO_MATERIALS: DemoMaterial[] = [
  { id: 'm1', title: '用户登录现状说明', subtitle: 'WPS 在线文档' },
  { id: 'm2', title: '8月需求评审会议纪要', subtitle: '会议纪要' },
];

type DevAssignSlot = 'frontend' | 'backend' | 'tester';

interface DevAssignSlotConfig {
  slot: DevAssignSlot;
  label: string;
  roleTag: string;
}

const DEV_ASSIGN_SLOTS: DevAssignSlotConfig[] = [
  { slot: 'frontend', label: '前端负责人', roleTag: '前端开发' },
  { slot: 'backend', label: '后端负责人', roleTag: '后端开发' },
  { slot: 'tester', label: '测试负责人', roleTag: '测试' },
];

function memberByUserId(members: ProjectMember[], userId?: number): ProjectMember | null {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId) ?? null;
}

function defaultDevAssignees(
  members: ProjectMember[],
  productOwnerUserId?: number,
  developerUserId?: number,
  backendDeveloperUserId?: number,
  testerUserId?: number,
): { frontendUserId?: number; backendUserId?: number; testerUserId?: number } {
  if (!members.length) return {};
  const occupied = new Set<number>();
  if (productOwnerUserId) occupied.add(productOwnerUserId);

  const pool = members.filter((m) => !occupied.has(m.user_id));
  const fallback = pool.length ? pool : members.filter((m) => m.user_id !== productOwnerUserId);

  let frontendUserId = developerUserId;
  if (frontendUserId && occupied.has(frontendUserId)) {
    frontendUserId = undefined;
  }
  const frontendMember = memberByUserId(members, frontendUserId)
    ?? fallback.find((m) => !occupied.has(m.user_id))
    ?? fallback[0];
  if (frontendMember) occupied.add(frontendMember.user_id);

  let backendUserId = backendDeveloperUserId;
  if (backendUserId && occupied.has(backendUserId)) {
    backendUserId = undefined;
  }
  const backendMember = memberByUserId(members, backendUserId)
    ?? fallback.find((m) => !occupied.has(m.user_id))
    ?? fallback.find((m) => m.user_id !== frontendMember?.user_id)
    ?? fallback[1]
    ?? fallback[0];
  if (backendMember) occupied.add(backendMember.user_id);

  let resolvedTesterId = testerUserId;
  if (resolvedTesterId && occupied.has(resolvedTesterId)) {
    resolvedTesterId = undefined;
  }
  const testerMember = memberByUserId(members, resolvedTesterId)
    ?? fallback.find((m) => !occupied.has(m.user_id))
    ?? fallback.find((m) => m.user_id !== frontendMember?.user_id && m.user_id !== backendMember?.user_id)
    ?? fallback[2]
    ?? fallback[0];

  return {
    frontendUserId: frontendMember?.user_id,
    backendUserId: backendMember?.user_id,
    testerUserId: testerMember?.user_id,
  };
}

interface MemberPickerDialogProps {
  title: string;
  members: ProjectMember[];
  selectedUserId?: number;
  excludeUserIds?: number[];
  onClose: () => void;
  onSelect: (member: ProjectMember) => void;
}

function MemberPickerDialog({
  title,
  members,
  selectedUserId,
  excludeUserIds = [],
  onClose,
  onSelect,
}: MemberPickerDialogProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) return;
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const excluded = new Set(excludeUserIds);
    return members.filter((m) => {
      if (excluded.has(m.user_id)) return false;
      if (!q) return true;
      return m.user_name.toLowerCase().includes(q);
    });
  }, [members, search, excludeUserIds]);

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
        <p className="tsw-muted tsw-memberDialogSub">
          从当前项目成员中选择；{UNIQUE_REQUIREMENT_ROLE_HINT}，已担任其他职能的成员不会出现在列表中。
        </p>
        <div className="tsw-memberSearchWrap" ref={searchRef}>
          <div className="tsw-memberSearchBox">
            <span className="tsw-memberSearchIcon" aria-hidden="true">🔍</span>
            <input
              className="tsw-memberSearchInput"
              placeholder="搜索成员姓名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="tsw-memberSearchDropdown">
            {filteredMembers.length ? filteredMembers.map((member) => {
              const label = userDisplayName(member.user_name);
              const active = selectedUserId === member.user_id;
              return (
                <button
                  key={member.id}
                  type="button"
                  className={`tsw-memberSearchOption tsw-memberSearchOptionBtn${active ? ' tsw-memberSearchOptionActive' : ''}`}
                  onClick={() => {
                    onSelect(member);
                    onClose();
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
                  </span>
                </button>
              );
            }) : (
              <p className="tsw-muted tsw-memberSearchEmpty">未找到匹配成员</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DevAssignRowProps {
  config: DevAssignSlotConfig;
  member: ProjectMember | null;
  canEdit: boolean;
  onChange: () => void;
}

function DevAssignRow({ config, member, canEdit, onChange }: DevAssignRowProps) {
  const label = member ? userDisplayName(member.user_name) : '未指定';
  return (
    <div className="tsw-reqDevAssignRow">
      <div className="tsw-reqDevAssignLabel">
        {config.label}
        <span className="tsw-required">（必填）</span>
      </div>
      <div className="tsw-reqDevAssignPerson">
        <span
          className="tsw-userAvatar"
          style={{ background: userAvatarColor(label) }}
          aria-hidden="true"
        >
          {userAvatarLetter(label)}
        </span>
        <strong>{label}</strong>
        {member ? <span className="tsw-reqRoleTag">{config.roleTag}</span> : null}
      </div>
      {canEdit ? (
        <button type="button" className="tsw-linkBtn" onClick={onChange}>
          更换
        </button>
      ) : (
        <span className="tsw-tag tsw-tagMuted" title={PRODUCT_OWNER_ONLY_HINT}>只读</span>
      )}
    </div>
  );
}

function AsidePerson({
  name,
  roleLabel,
}: {
  name: string;
  roleLabel: string;
}) {
  return (
    <div className="tsw-reqAsidePerson">
      <span
        className="tsw-userAvatar tsw-userAvatarLg"
        style={{ background: userAvatarColor(name) }}
        aria-hidden="true"
      >
        {userAvatarLetter(name)}
      </span>
      <div className="tsw-reqAsidePersonMeta">
        <strong>{name}</strong>
        <span className="tsw-tag">{roleLabel}</span>
      </div>
    </div>
  );
}

function buildDemoDocuments(requirement: Requirement, ownerName: string): DemoDocument[] {
  return [
    {
      id: 'doc-1',
      title: `${requirement.requirement_code} 产品方案`,
      tags: [
        { label: 'AI 生成', tone: 'blue' },
        { label: '待完善', tone: 'yellow' },
      ],
      creator: ownerName,
      updatedAt: '刚刚更新',
    },
  ];
}

export function RequirementDetailView({
  project,
  requirement,
  members,
  currentUserId,
  onBackToList,
  onRequirementUpdated,
  onOpenRequirement,
}: Props) {
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<DevAssignSlot | null>(null);
  const [frontendUserId, setFrontendUserId] = useState<number | undefined>();
  const [backendUserId, setBackendUserId] = useState<number | undefined>();
  const [testerUserId, setTesterUserId] = useState<number | undefined>();
  const [timeline, setTimeline] = useState<RequirementTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const currentPhaseIndex = useMemo(
    () => resolveRequirementPhaseIndex(requirement.current_status),
    [requirement.current_status],
  );
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(currentPhaseIndex);

  const phaseStates = useMemo(
    () => resolveRequirementPhaseStates(requirement.current_status),
    [requirement.current_status],
  );

  const productOwner = useMemo(() => {
    if (!requirement.product_owner_user_id) return null;
    return members.find((m) => m.user_id === requirement.product_owner_user_id) ?? null;
  }, [members, requirement.product_owner_user_id]);

  const ownerName = productOwner
    ? userDisplayName(productOwner.user_name)
    : '未指定';

  const isProductPhase = requirement.current_status === 'PRODUCT_EDITING';
  const isAssignPhase = requirement.current_status === 'PRODUCT_REVIEW';
  const isBugFixRequirement = requirement.development_scope === 'BUG_FIX';
  const isDevPhase = requirement.current_status === 'DEVELOPMENT' && !isBugFixRequirement;
  const isBugFixWorkPhase = isBugFixRequirement && (requirement.current_status === 'DEVELOPMENT' || requirement.current_status === 'DONE');
  const isTestPhase = requirement.current_status === 'TESTING';
  const isBugFixingPhase = requirement.current_status === 'BUG_FIXING';
  const isAcceptancePhase = requirement.current_status === 'DONE' && !isBugFixRequirement;
  const isViewingCurrentPhase = selectedPhaseIndex === currentPhaseIndex;
  const isHistoricalView = selectedPhaseIndex < currentPhaseIndex;
  const viewingStep = REQUIREMENT_PHASE_STEPS[selectedPhaseIndex] ?? REQUIREMENT_PHASE_STEPS[0];
  const showActiveProductDocs = isViewingCurrentPhase && (isProductPhase || isAssignPhase);
  const showDemoDocs = showActiveProductDocs;
  const demoDocuments = useMemo(
    () => buildDemoDocuments(requirement, ownerName),
    [requirement, ownerName],
  );

  useEffect(() => {
    setSelectedPhaseIndex(currentPhaseIndex);
  }, [requirement.id, currentPhaseIndex]);

  useEffect(() => {
    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError(null);
    void api.getRequirementTimeline(requirement.id).then(
      (data) => {
        if (!cancelled) setTimeline(data);
      },
      (err: unknown) => {
        if (!cancelled) {
          setTimeline(null);
          setTimelineError(err instanceof Error ? err.message : '加载历史记录失败');
        }
      },
    ).finally(() => {
      if (!cancelled) setTimelineLoading(false);
    });
    return () => { cancelled = true; };
  }, [requirement.id, requirement.status_version]);

  useEffect(() => {
    const defaults = defaultDevAssignees(
      members,
      requirement.product_owner_user_id,
      requirement.developer_user_id,
      requirement.backend_developer_user_id,
      requirement.tester_user_id,
    );
    setFrontendUserId(defaults.frontendUserId);
    setBackendUserId(defaults.backendUserId);
    setTesterUserId(defaults.testerUserId);
  }, [
    requirement.id,
    requirement.product_owner_user_id,
    requirement.developer_user_id,
    requirement.backend_developer_user_id,
    requirement.tester_user_id,
    members,
  ]);

  const frontendMember = memberByUserId(members, frontendUserId);
  const backendMember = memberByUserId(members, backendUserId);
  const testerMember = memberByUserId(members, testerUserId);

  const testerName = testerMember
    ? userDisplayName(testerMember.user_name)
    : requirement.tester_user_id
      ? `用户 ${requirement.tester_user_id}`
      : '未指定';

  const devPhaseView = useDevPhaseViewContext(
    requirement,
    members,
    currentUserId,
    frontendUserId,
    backendUserId,
  );
  const testPhaseView = useTestPhaseViewContext(
    requirement,
    members,
    currentUserId,
    frontendUserId,
    backendUserId,
  );

  const canManageAsProductOwner = isRequirementProductOwner(requirement, currentUserId);

  const handleCompleteProductDesign = async () => {
    if (requirement.current_status !== 'PRODUCT_EDITING') return;
    if (!canManageAsProductOwner) {
      setActionError(PRODUCT_OWNER_ONLY_HINT);
      return;
    }
    setTransitioning(true);
    setActionError(null);
    try {
      const updated = await api.transitionRequirement(requirement.id, 'PRODUCT_REVIEW', {
        spec_body: requirement.description || requirement.title,
        acceptance_criteria: '产品文档已确认，进入评审阶段。',
        product_owner_user_id: requirement.product_owner_user_id,
      });
      onRequirementUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '状态流转失败');
    } finally {
      setTransitioning(false);
    }
  };

  const roleDraft = useMemo(
    () => requirementRoleDraftFromRequirement(requirement, {
      frontendUserId,
      backendUserId,
      testerUserId,
    }),
    [requirement, frontendUserId, backendUserId, testerUserId],
  );

  const devAssignExcludeUserIds = useMemo(() => {
    if (!pickerSlot) return [];
    return excludeUserIdsForDevAssignPicker(roleDraft, pickerSlot);
  }, [pickerSlot, roleDraft]);

  const handleConfirmDevAssignment = async () => {
    if (!canManageAsProductOwner) {
      setActionError(PRODUCT_OWNER_ONLY_HINT);
      return;
    }
    if (!frontendMember || !backendMember || !testerMember) {
      setActionError('请指定前端、后端与测试负责人');
      return;
    }
    const roleError = validateUniqueRequirementRoles(roleDraft);
    if (roleError) {
      setActionError(roleError);
      return;
    }
    setTransitioning(true);
    setActionError(null);
    try {
      const frontendName = userDisplayName(frontendMember.user_name);
      const backendName = userDisplayName(backendMember.user_name);
      const testerName = userDisplayName(testerMember.user_name);
      const updated = await api.transitionRequirement(requirement.id, 'DEVELOPMENT', {
        review_result: 'APPROVED',
        review_comment: `已分配前端负责人：${frontendName}，后端负责人：${backendName}，测试负责人：${testerName}。`,
        reviewer_user_id: requirement.product_owner_user_id,
        developer_user_id: frontendUserId,
        backend_developer_user_id: backendUserId,
        tester_user_id: testerUserId,
        remark: '研发与测试人员分配完成，进入研发阶段。',
      });
      onRequirementUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '状态流转失败');
    } finally {
      setTransitioning(false);
    }
  };

  const handlePickerSelect = (member: ProjectMember) => {
    if (!canManageAsProductOwner) return;
    if (pickerSlot === 'frontend') {
      setFrontendUserId(member.user_id);
    } else if (pickerSlot === 'backend') {
      setBackendUserId(member.user_id);
    } else if (pickerSlot === 'tester') {
      setTesterUserId(member.user_id);
    }
    setActionError(null);
  };

  const assignMemberForSlot = (slot: DevAssignSlot) => {
    if (slot === 'frontend') return frontendMember;
    if (slot === 'backend') return backendMember;
    return testerMember;
  };

  const assignSlotLabel = (slot: DevAssignSlot) => {
    if (slot === 'frontend') return '前端';
    if (slot === 'backend') return '后端';
    return '测试';
  };

  return (
    <div className="tsw-reqDetail">
      <div className="tsw-breadcrumb tsw-reqDetailBreadcrumb">
        <button type="button" className="tsw-linkBtn" onClick={onBackToList}>
          ← 需求列表
        </button>
        <span className="tsw-breadcrumbPath">
          项目空间
          <span className="tsw-breadcrumbSep">/</span>
          {project.name}
          <span className="tsw-breadcrumbSep">/</span>
          需求
          <span className="tsw-breadcrumbSep">/</span>
          {requirement.requirement_code}
        </span>
      </div>

      <TestPhaseProvider isTester={testPhaseView.role === 'tester'}>
      <div className="tsw-reqDetailLayout">
        <div className="tsw-reqDetailMain">
          <header className="tsw-reqDetailHeader">
            <div className="tsw-reqDetailTitleRow">
              <h2 className="tsw-reqDetailTitle">{requirement.title}</h2>
              <div className="tsw-reqDetailBadges">
                <span className="tsw-reqDetailStatusBadge">
                  {REQUIREMENT_PHASE_BADGE[requirement.current_status] ?? requirement.current_status}
                </span>
                {isDevPhase ? <DevPhaseViewBadge viewContext={devPhaseView} /> : null}
                {isTestPhase ? <TestPhaseViewBadge viewContext={testPhaseView} /> : null}
              </div>
            </div>
            <p className="tsw-reqDetailMeta tsw-muted">
              {isTestPhase ? (
                <>
                  测试负责人 {testerName}
                  <span className="tsw-breadcrumbSep">·</span>
                  产品负责人 {ownerName}
                </>
              ) : (
                <>
                  产品负责人 {ownerName}
                </>
              )}
              <span className="tsw-breadcrumbSep">·</span>
              优先级 {PRIORITY_LABELS[requirement.priority] ?? requirement.priority}
            </p>
          </header>

          <nav className="tsw-reqPhaseStepper" aria-label="需求阶段">
            <p className="tsw-muted tsw-reqPhaseStepperHint">点击已完成或当前节点，可查看该阶段信息与历史记录。</p>
            <ol className="tsw-reqPhaseList">
              {REQUIREMENT_PHASE_STEPS.map((step, index) => {
                const state = phaseStates[index] ?? 'upcoming';
                const reachable = isRequirementStepReachable(index, requirement.current_status);
                const selected = selectedPhaseIndex === index;
                return (
                  <li
                    key={step.id}
                    className="tsw-reqPhaseItem"
                    data-state={state}
                    data-selected={selected ? 'true' : 'false'}
                  >
                    {reachable ? (
                      <button
                        type="button"
                        className="tsw-reqPhaseBtn"
                        aria-current={selected ? 'step' : undefined}
                        onClick={() => setSelectedPhaseIndex(index)}
                      >
                        <span className="tsw-reqPhaseIcon" aria-hidden="true">
                          {state === 'completed' ? '✓' : state === 'current' ? '✎' : index + 1}
                        </span>
                        <span className="tsw-reqPhaseLabel">{step.title}</span>
                      </button>
                    ) : (
                      <>
                        <span className="tsw-reqPhaseIcon" aria-hidden="true">{index + 1}</span>
                        <span className="tsw-reqPhaseLabel">{step.title}</span>
                      </>
                    )}
                    {index < REQUIREMENT_PHASE_STEPS.length - 1 ? (
                      <span className="tsw-reqPhaseLine" aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </nav>

          {!isViewingCurrentPhase ? (
            <div className="tsw-reqPhaseViewBanner">
              <span>
                正在查看历史节点：<strong>{viewingStep.title}</strong>
              </span>
              <button
                type="button"
                className="tsw-linkBtn"
                onClick={() => setSelectedPhaseIndex(currentPhaseIndex)}
              >
                返回当前阶段
              </button>
            </div>
          ) : null}

          {isHistoricalView ? (
            <RequirementPhaseHistoryPanel
              step={viewingStep}
              requirement={requirement}
              members={members}
              timeline={timeline}
              loading={timelineLoading}
              error={timelineError}
            />
          ) : null}

          {isViewingCurrentPhase && isAssignPhase ? (
            <section className="tsw-card tsw-reqDetailSection">
              <h3 className="tsw-reqSectionTitle">研发人员分配</h3>
              <p className="tsw-muted tsw-reqDevAssignHint">
                {canManageAsProductOwner
                  ? '请指定前端、后端与测试负责人，确认后将进入研发阶段。'
                  : '研发人员分配由产品负责人决定，当前为只读查看。'}
              </p>
              <div className="tsw-reqDevAssignList">
                {DEV_ASSIGN_SLOTS.map((config) => (
                  <DevAssignRow
                    key={config.slot}
                    config={config}
                    member={assignMemberForSlot(config.slot)}
                    canEdit={canManageAsProductOwner}
                    onChange={() => {
                      if (canManageAsProductOwner) setPickerSlot(config.slot);
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {isViewingCurrentPhase && isDevPhase ? (
            <RequirementDevPhaseMain
              requirement={requirement}
              members={members}
              frontendUserId={frontendUserId}
              backendUserId={backendUserId}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
              onLockedFeature={setLockedFeature}
            />
          ) : null}

          {isViewingCurrentPhase && isBugFixWorkPhase ? (
            <RequirementBugFixWorkPanel
              requirement={requirement}
              members={members}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
              onOpenParent={onOpenRequirement}
            />
          ) : null}

          {isViewingCurrentPhase && isBugFixingPhase ? (
            <RequirementBugFixingPanel
              requirement={requirement}
              members={members}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
              onOpenRequirement={onOpenRequirement}
            />
          ) : null}

          {isViewingCurrentPhase && isTestPhase ? (
            <RequirementTestPhaseMain
              requirement={requirement}
              members={members}
              frontendUserId={frontendUserId}
              backendUserId={backendUserId}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
              onLockedFeature={setLockedFeature}
            />
          ) : null}

          {isViewingCurrentPhase && isAcceptancePhase ? (
            <RequirementAcceptancePanel
              requirement={requirement}
              members={members}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
            />
          ) : null}

          {isViewingCurrentPhase && !isDevPhase && !isTestPhase && !isBugFixingPhase && !isBugFixWorkPhase && !isAcceptancePhase ? (
          <>
          <section className="tsw-card tsw-reqDetailSection">
            <div className="tsw-reqSectionHead">
              <h3 className="tsw-reqSectionTitle">产品文档</h3>
              {canManageAsProductOwner && (isProductPhase || isAssignPhase) ? (
                <div className="tsw-reqSectionActions">
                  <button
                    type="button"
                    className="tsw-btn"
                    onClick={() => setLockedFeature('WPS 在线文档')}
                  >
                    关联在线文档
                  </button>
                  <button
                    type="button"
                    className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                    onClick={() => setLockedFeature('AI 生成需求文档')}
                  >
                    ✦ AI 生成文档
                  </button>
                </div>
              ) : (isProductPhase || isAssignPhase) ? (
                <span className="tsw-tag tsw-tagMuted" title={PRODUCT_OWNER_ONLY_HINT}>只读</span>
              ) : null}
            </div>

            {showDemoDocs ? (
              <div className="tsw-reqDocTableWrap">
                <table className="tsw-reqDocTable">
                  <thead>
                    <tr>
                      <th>标题</th>
                      <th>类型/状态</th>
                      <th>创建人</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoDocuments.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <strong>{doc.title}</strong>
                        </td>
                        <td>
                          <div className="tsw-reqDocTags">
                            {doc.tags.map((tag) => (
                              <span
                                key={tag.label}
                                className="tsw-reqDocTag"
                                data-tone={tag.tone}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{doc.creator}</td>
                        <td className="tsw-muted">{doc.updatedAt}</td>
                        <td>
                          {canManageAsProductOwner ? (
                            <button
                              type="button"
                              className="tsw-linkBtn"
                              onClick={() => setLockedFeature('WPS 在线文档')}
                            >
                              查看编辑 →
                            </button>
                          ) : (
                            <span className="tsw-muted">查看（只读）</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="tsw-fieldHint">Demo 展示占位文档，WPS 在线文档能力暂未开放。</p>
              </div>
            ) : (
              <p className="tsw-muted">暂无产品文档。</p>
            )}
          </section>

          <section className="tsw-card tsw-reqDetailSection">
            <h3 className="tsw-reqSectionTitle">关联资料</h3>
            <div className="tsw-reqMaterialGrid">
              {showDemoDocs ? DEMO_MATERIALS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="tsw-reqMaterialCard"
                  disabled={!canManageAsProductOwner}
                  title={canManageAsProductOwner ? undefined : PRODUCT_OWNER_ONLY_HINT}
                  onClick={() => {
                    if (canManageAsProductOwner) setLockedFeature('WPS 在线文档');
                  }}
                >
                  <span className="tsw-reqMaterialIcon" aria-hidden="true">📄</span>
                  <strong>{item.title}</strong>
                  <span className="tsw-muted">{item.subtitle}</span>
                </button>
              )) : null}
              {canManageAsProductOwner ? (
                <button
                  type="button"
                  className="tsw-reqMaterialAdd"
                  onClick={() => setLockedFeature('WPS 在线文档')}
                >
                  + 添加资料
                </button>
              ) : null}
            </div>
          </section>
          </>
          ) : null}
        </div>

        <aside className="tsw-reqDetailAside">
          {!isTestPhase ? (
            <div className="tsw-card tsw-reqAsideCard">
              <h4 className="tsw-reqAsideTitle">
                {isAcceptancePhase ? '验收负责人' : '产品负责人'}
              </h4>
              <AsidePerson name={ownerName} roleLabel="产品负责人" />
            </div>
          ) : null}

          {isViewingCurrentPhase && isDevPhase ? (
            <RequirementDevPhaseAside
              requirement={requirement}
              members={members}
              frontendUserId={frontendUserId}
              backendUserId={backendUserId}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
              onLockedFeature={setLockedFeature}
            />
          ) : null}

          {isViewingCurrentPhase && isTestPhase ? (
            <RequirementTestPhaseAside
              requirement={requirement}
              members={members}
              frontendUserId={frontendUserId}
              backendUserId={backendUserId}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
              onLockedFeature={setLockedFeature}
            />
          ) : null}

          {isViewingCurrentPhase && isProductPhase ? (
            <div className="tsw-card tsw-reqAsideCard">
              <h4 className="tsw-reqAsideTitle">产品阶段操作</h4>
              <p className="tsw-muted tsw-reqAsideHint">
                {canManageAsProductOwner
                  ? '产品文档确认后，可进入研发分配阶段。'
                  : PRODUCT_OWNER_ONLY_HINT}
              </p>
              {actionError ? <p className="tsw-error">{actionError}</p> : null}
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid tsw-reqAsidePrimaryBtn"
                disabled={transitioning || !canManageAsProductOwner}
                title={canManageAsProductOwner ? undefined : PRODUCT_OWNER_ONLY_HINT}
                onClick={() => void handleCompleteProductDesign()}
              >
                {transitioning ? '处理中…' : '完成产品设计'}
              </button>
            </div>
          ) : null}

          {isViewingCurrentPhase && isAssignPhase ? (
            <div className="tsw-card tsw-reqAsideCard">
              <h4 className="tsw-reqAsideTitle">研发阶段操作</h4>
              <p className="tsw-muted tsw-reqAsideHint">
                {canManageAsProductOwner
                  ? '请确认前端、后端与测试负责人均已指定，确认后将进入研发阶段。'
                  : '研发分配由产品负责人确认，当前为只读查看。'}
              </p>
              {actionError ? <p className="tsw-error">{actionError}</p> : null}
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid tsw-reqAsidePrimaryBtn"
                disabled={
                  transitioning
                  || !frontendMember
                  || !backendMember
                  || !testerMember
                  || !canManageAsProductOwner
                }
                title={canManageAsProductOwner ? undefined : PRODUCT_OWNER_ONLY_HINT}
                onClick={() => void handleConfirmDevAssignment()}
              >
                {transitioning ? '处理中…' : '确认分配并进入研发'}
              </button>
            </div>
          ) : null}

          <div className="tsw-card tsw-reqAsideCard">
            <h4 className="tsw-reqAsideTitle">需求群聊（可选）</h4>
            <p className="tsw-muted tsw-reqAsideHint">
              关联群聊后可同步需求进展。
            </p>
            <button
              type="button"
              className="tsw-btn tsw-reqAsideSecondaryBtn"
              onClick={() => setLockedFeature('关联项目群')}
            >
              💬 关联需求群聊
            </button>
          </div>
        </aside>
      </div>
      </TestPhaseProvider>

      {lockedFeature ? (
        <FeatureLockedDialog label={lockedFeature} onClose={() => setLockedFeature(null)} />
      ) : null}

      {pickerSlot ? (
        <MemberPickerDialog
          title={`选择${assignSlotLabel(pickerSlot)}负责人`}
          members={members}
          selectedUserId={
            pickerSlot === 'frontend'
              ? frontendUserId
              : pickerSlot === 'backend'
                ? backendUserId
                : testerUserId
          }
          excludeUserIds={devAssignExcludeUserIds}
          onClose={() => setPickerSlot(null)}
          onSelect={handlePickerSelect}
        />
      ) : null}
    </div>
  );
}
