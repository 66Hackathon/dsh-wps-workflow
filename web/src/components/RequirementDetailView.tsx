import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { userAvatarColor, userAvatarLetter, userDisplayName } from '../memberRoles';
import {
  DEVELOPER_ONLY_HINT,
  isRequirementDeveloper,
  isRequirementProductOwner,
  PRODUCT_OWNER_ONLY_HINT,
} from '../requirementPermissions';
import { PRIORITY_LABELS } from '../requirementCreate';
import {
  REQUIREMENT_PHASE_BADGE,
  REQUIREMENT_PHASE_OWNER_ROLE_LABEL,
  REQUIREMENT_PHASE_STEPS,
  isRequirementStepReachable,
  resolveRequirementPhaseIndex,
  resolveRequirementPhaseOwnerRole,
  resolveRequirementPhaseOwnerUserId,
  resolveRequirementPhaseStates,
} from '../requirementPhase';
import type { Project, ProjectMember, Requirement, RequirementTimeline } from '../types';
import type { WpsDocument } from '../types/wps';
import { wpsDocumentHref } from '../types/wps';
import { FeatureLockedDialog } from './FeatureLockedDialog';
import { WpsDocumentPickerDialog } from './wps/WpsDocumentPickerDialog';
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
import { RequirementRegressionPanel } from './RequirementRegressionPanel';
import { RequirementViewDialog } from './RequirementViewDialog';

interface Props {
  project: Project;
  requirement: Requirement;
  members: ProjectMember[];
  currentUserId?: number;
  onBackToList: () => void;
  onRequirementUpdated: (requirement: Requirement) => void;
  onOpenRequirement?: (requirementId: number) => void;
}

function memberByUserId(members: ProjectMember[], userId?: number): ProjectMember | null {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId) ?? null;
}

function defaultDevAssignees(
  requirement: Requirement,
): { frontendUserId?: number; backendUserId?: number; testerUserId?: number } {
  const directions = (requirement.dev_directions || 'FRONTEND')
    .split(',')
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);
  const needFrontend = directions.includes('FRONTEND') || directions.length === 0;
  const needBackend = directions.includes('BACKEND');
  return {
    frontendUserId: needFrontend ? requirement.developer_user_id : undefined,
    backendUserId: needBackend ? requirement.backend_developer_user_id : undefined,
    testerUserId: requirement.tester_user_id,
  };
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
  const [frontendUserId, setFrontendUserId] = useState<number | undefined>();
  const [backendUserId, setBackendUserId] = useState<number | undefined>();
  const [testerUserId, setTesterUserId] = useState<number | undefined>();
  const [timeline, setTimeline] = useState<RequirementTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [docPickerTarget, setDocPickerTarget] = useState<'product' | 'dev' | null>(null);
  const [linkedProductDoc, setLinkedProductDoc] = useState<WpsDocument | null>(null);
  const [linkedDevDoc, setLinkedDevDoc] = useState<WpsDocument | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

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
    const ownerId = requirement.created_by || requirement.product_owner_user_id;
    if (!ownerId) return null;
    return members.find((m) => m.user_id === ownerId) ?? null;
  }, [members, requirement.created_by, requirement.product_owner_user_id]);

  const ownerName = productOwner
    ? userDisplayName(productOwner.user_name)
    : '未指定';

  const isProductPhase = requirement.current_status === 'CREATED'
    || requirement.current_status === 'PRODUCT_DESIGN';
  const isDevDesignPhase = requirement.current_status === 'DEV_DESIGN';
  const isLegacyBugFix = requirement.development_scope === 'BUG_FIX';
  const isBugItem = requirement.item_type === 'BUG' || isLegacyBugFix;
  const isDevPhase = requirement.current_status === 'DEVELOPMENT' && !isLegacyBugFix;
  const isBugFixWorkPhase = isLegacyBugFix && (requirement.current_status === 'DEVELOPMENT' || requirement.current_status === 'DONE');
  const isTestPhase = requirement.current_status === 'TESTING';
  const isBugFixingPhase = requirement.current_status === 'BUG_FIXING';
  const isAcceptancePhase = requirement.current_status === 'PRODUCT_ACCEPTANCE';
  const isRegressionPhase = requirement.current_status === 'REGRESSION' && !isBugItem;
  const isClosedPhase = requirement.current_status === 'CLOSED' && !isBugItem;
  const isViewingCurrentPhase = selectedPhaseIndex === currentPhaseIndex;
  const isHistoricalView = selectedPhaseIndex < currentPhaseIndex;
  const viewingStep = REQUIREMENT_PHASE_STEPS[selectedPhaseIndex] ?? REQUIREMENT_PHASE_STEPS[0];
  const phaseOwnerRole = resolveRequirementPhaseOwnerRole(viewingStep.id) ?? 'product';
  const phaseOwnerRoleLabel = REQUIREMENT_PHASE_OWNER_ROLE_LABEL[phaseOwnerRole];
  const phaseOwnerUserId = resolveRequirementPhaseOwnerUserId(viewingStep.id, requirement);
  const phaseOwnerMember = phaseOwnerUserId
    ? members.find((m) => m.user_id === phaseOwnerUserId) ?? null
    : null;
  const phaseOwnerName = phaseOwnerMember
    ? userDisplayName(phaseOwnerMember.user_name)
    : '未指定';

  useEffect(() => {
    setSelectedPhaseIndex(currentPhaseIndex);
    setLinkedProductDoc(null);
    setLinkedDevDoc(null);
    setDocPickerTarget(null);
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
    const defaults = defaultDevAssignees(requirement);
    setFrontendUserId(defaults.frontendUserId);
    setBackendUserId(defaults.backendUserId);
    setTesterUserId(defaults.testerUserId);
  }, [
    requirement.id,
    requirement.dev_directions,
    requirement.developer_user_id,
    requirement.backend_developer_user_id,
    requirement.tester_user_id,
  ]);

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
  const canManageAsDeveloper = isRequirementDeveloper(requirement, currentUserId);

  const handleCompleteProductDesign = async () => {
    if (!isProductPhase) return;
    if (!canManageAsProductOwner) {
      setActionError(PRODUCT_OWNER_ONLY_HINT);
      return;
    }
    setTransitioning(true);
    setActionError(null);
    try {
      let current = requirement;
      if (current.current_status === 'CREATED') {
        current = await api.transitionRequirement(current.id, 'PRODUCT_DESIGN', {});
      }
      const spec = linkedProductDoc
        ? `${current.description || current.title}\n\n[WPS文档] ${linkedProductDoc.name}${linkedProductDoc.link_url ? ` ${linkedProductDoc.link_url}` : ''}`
        : (current.description || current.title || '产品方案已确认（未关联在线文档）');
      const updated = await api.transitionRequirement(current.id, 'DEV_DESIGN', {
        spec_body: spec,
        acceptance_criteria: '产品方案已确认，进入研发方案设计。',
      });
      onRequirementUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '状态流转失败');
    } finally {
      setTransitioning(false);
    }
  };

  const handleCompleteDevDesign = async () => {
    if (!isDevDesignPhase) return;
    if (!canManageAsDeveloper) {
      setActionError(DEVELOPER_ONLY_HINT);
      return;
    }
    setTransitioning(true);
    setActionError(null);
    try {
      const doc = linkedDevDoc
        ? `[WPS文档] ${linkedDevDoc.name}${linkedDevDoc.link_url ? ` ${linkedDevDoc.link_url}` : ''}`
        : '研发方案已确认（未关联在线文档）';
      const updated = await api.transitionRequirement(requirement.id, 'DEVELOPMENT', {
        dev_design_doc: doc,
        remark: '研发方案已确认，进入研发阶段。',
      });
      onRequirementUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '状态流转失败');
    } finally {
      setTransitioning(false);
    }
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
                <button
                  type="button"
                  className="tsw-btn tsw-btnGhost tsw-reqViewEntryBtn"
                  onClick={() => setViewDialogOpen(true)}
                >
                  查看需求
                </button>
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
            <p className="tsw-muted tsw-reqPhaseStepperHint">点击已完成或当前节点，可查看需求详情与历史记录。</p>
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
                      <span className="tsw-reqPhaseStatic">
                        <span className="tsw-reqPhaseIcon" aria-hidden="true">{index + 1}</span>
                        <span className="tsw-reqPhaseLabel">{step.title}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {!isViewingCurrentPhase ? (
            <div className="tsw-reqPhaseViewBanner">
              <span>
                正在查看需求详情：<strong>{viewingStep.title}</strong>
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
              onOpenRequirement={onOpenRequirement}
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

          {isViewingCurrentPhase && (isRegressionPhase || isClosedPhase) ? (
            <RequirementRegressionPanel
              requirement={requirement}
              members={members}
              currentUserId={currentUserId}
              onRequirementUpdated={onRequirementUpdated}
            />
          ) : null}

          {isViewingCurrentPhase && isProductPhase ? (
          <section className="tsw-card tsw-reqDetailSection">
            <div className="tsw-reqSectionHead">
              <h3 className="tsw-reqSectionTitle">产品方案文档</h3>
            </div>
            <div className="tsw-reqDocEntryGrid">
              <button
                type="button"
                className="tsw-reqDocEntryCard"
                disabled={!canManageAsProductOwner}
                title={canManageAsProductOwner ? undefined : PRODUCT_OWNER_ONLY_HINT}
                onClick={() => {
                  if (canManageAsProductOwner) setDocPickerTarget('product');
                }}
              >
                <span className="tsw-reqDocEntryIcon" aria-hidden="true">📄</span>
                <strong>在线文档</strong>
                <span className="tsw-muted">从 WPS 云文档选择产品方案</span>
              </button>
              <button
                type="button"
                className="tsw-reqDocEntryCard"
                title="暂未开放"
                onClick={() => setLockedFeature('AI 生成文档')}
              >
                <span className="tsw-reqDocEntryIcon" aria-hidden="true">✦</span>
                <strong>AI 生成文档</strong>
                <span className="tsw-tag tsw-tagMuted">暂未开放</span>
              </button>
            </div>
            {linkedProductDoc ? (
              <div className="tsw-wpsDocCard" style={{ marginTop: 12 }}>
                <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
                <div className="tsw-wpsDocRowText">
                  <strong>{linkedProductDoc.name}</strong>
                  <span className="tsw-muted">{linkedProductDoc.type || '在线文档'}</span>
                </div>
                {wpsDocumentHref(linkedProductDoc) ? (
                  <a className="tsw-linkBtn" href={wpsDocumentHref(linkedProductDoc)} target="_blank" rel="noreferrer">
                    打开
                  </a>
                ) : null}
                {canManageAsProductOwner ? (
                  <button type="button" className="tsw-linkBtn" onClick={() => setLinkedProductDoc(null)}>
                    移除
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="tsw-fieldHint">在线文档为可选项，未关联也可完成并进入下一阶段。</p>
            )}
          </section>
          ) : null}

          {isViewingCurrentPhase && isDevDesignPhase ? (
          <section className="tsw-card tsw-reqDetailSection">
            <div className="tsw-reqSectionHead">
              <h3 className="tsw-reqSectionTitle">研发方案文档</h3>
            </div>
            <div className="tsw-reqDocEntryGrid">
              <button
                type="button"
                className="tsw-reqDocEntryCard"
                disabled={!canManageAsDeveloper}
                title={canManageAsDeveloper ? undefined : DEVELOPER_ONLY_HINT}
                onClick={() => {
                  if (canManageAsDeveloper) setDocPickerTarget('dev');
                }}
              >
                <span className="tsw-reqDocEntryIcon" aria-hidden="true">📄</span>
                <strong>在线文档</strong>
                <span className="tsw-muted">从 WPS 云文档选择研发方案</span>
              </button>
              <button
                type="button"
                className="tsw-reqDocEntryCard"
                title="暂未开放"
                onClick={() => setLockedFeature('AI 生成文档')}
              >
                <span className="tsw-reqDocEntryIcon" aria-hidden="true">✦</span>
                <strong>AI 生成文档</strong>
                <span className="tsw-tag tsw-tagMuted">暂未开放</span>
              </button>
            </div>
            {linkedDevDoc ? (
              <div className="tsw-wpsDocCard" style={{ marginTop: 12 }}>
                <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
                <div className="tsw-wpsDocRowText">
                  <strong>{linkedDevDoc.name}</strong>
                  <span className="tsw-muted">{linkedDevDoc.type || '在线文档'}</span>
                </div>
                {wpsDocumentHref(linkedDevDoc) ? (
                  <a className="tsw-linkBtn" href={wpsDocumentHref(linkedDevDoc)} target="_blank" rel="noreferrer">
                    打开
                  </a>
                ) : null}
                {canManageAsDeveloper ? (
                  <button type="button" className="tsw-linkBtn" onClick={() => setLinkedDevDoc(null)}>
                    移除
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="tsw-fieldHint">在线文档为可选项，未关联也可完成并进入下一阶段。</p>
            )}
          </section>
          ) : null}
        </div>

        <aside className="tsw-reqDetailAside">
          <div className="tsw-card tsw-reqAsideCard">
            <h4 className="tsw-reqAsideTitle">{phaseOwnerRoleLabel}</h4>
            <AsidePerson name={phaseOwnerName} roleLabel={phaseOwnerRoleLabel} />
          </div>

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
                  ? '在线文档可选。确认后可直接进入研发方案设计。'
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

          {isViewingCurrentPhase && isDevDesignPhase ? (
            <div className="tsw-card tsw-reqAsideCard">
              <h4 className="tsw-reqAsideTitle">研发方案操作</h4>
              <p className="tsw-muted tsw-reqAsideHint">
                {canManageAsDeveloper
                  ? '在线文档可选。确认后可直接进入研发阶段。'
                  : DEVELOPER_ONLY_HINT}
              </p>
              {actionError ? <p className="tsw-error">{actionError}</p> : null}
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid tsw-reqAsidePrimaryBtn"
                disabled={transitioning || !canManageAsDeveloper}
                title={canManageAsDeveloper ? undefined : DEVELOPER_ONLY_HINT}
                onClick={() => void handleCompleteDevDesign()}
              >
                {transitioning ? '处理中…' : '完成研发方案'}
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

      {docPickerTarget ? (
        <WpsDocumentPickerDialog
          title={docPickerTarget === 'dev' ? '选择研发方案文档' : '选择产品方案文档'}
          subtitle={
            docPickerTarget === 'dev'
              ? '从当前账号可访问的云文档中选择研发方案。'
              : '从当前账号可访问的云文档中选择产品方案。'
          }
          onClose={() => setDocPickerTarget(null)}
          onConfirm={async (doc) => {
            if (docPickerTarget === 'dev') {
              setLinkedDevDoc(doc);
            } else {
              setLinkedProductDoc(doc);
            }
          }}
        />
      ) : null}

      {viewDialogOpen ? (
        <RequirementViewDialog
          requirement={requirement}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setViewDialogOpen(false)}
          onUpdated={(updated) => {
            onRequirementUpdated(updated);
          }}
        />
      ) : null}
    </div>
  );
}
