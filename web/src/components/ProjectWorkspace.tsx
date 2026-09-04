import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Bug, Project, ProjectTab, Requirement } from '../types';
import { PROJECT_TAB_LABELS } from '../types';
import { isProjectManager } from '../memberRoles';
import { FeatureGrid } from './FeatureGrid';
import { FeatureLockedDialog } from './FeatureLockedDialog';
import { CreateRequirementFlow } from './CreateRequirementFlow';
import { ProjectMembersPanel } from './ProjectMembersPanel';
import { ProjectOverview } from './ProjectOverview';
import { ProjectSettingsPanel } from './ProjectSettingsPanel';
import { RequirementDetailView } from './RequirementDetailView';
import { RequirementListPanel } from './RequirementListPanel';
import { RequirementViewDialog } from './RequirementViewDialog';
import { WpsDocumentsPanel } from './wps/WpsDocumentsPanel';
import { WpsGroupChatPanel } from './wps/WpsGroupChatPanel';

interface Props {
  project: Project;
  projectRole?: string;
  currentUserId?: number;
  initialEntry?: 'requirements' | 'settings';
  onBack: () => void;
  onProjectUpdated?: (project: Project) => void;
  onProjectDeleted?: () => void;
}

type RequirementsView = 'list' | 'create' | 'detail';

export function ProjectWorkspace({
  project,
  projectRole,
  currentUserId,
  initialEntry = 'requirements',
  onBack,
  onProjectUpdated,
  onProjectDeleted,
}: Props) {
  const [tab, setTab] = useState<ProjectTab>(
    initialEntry === 'settings' ? 'overview' : 'requirements',
  );
  const [showSettings, setShowSettings] = useState(initialEntry === 'settings');
  const [requirementsView, setRequirementsView] = useState<RequirementsView>('list');
  const [selectedRequirementId, setSelectedRequirementId] = useState<number | null>(null);
  const [viewingRequirementId, setViewingRequirementId] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [members, setMembers] = useState(project.members ?? []);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingRequirements, setLoadingRequirements] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);

  useEffect(() => {
    setMembers(project.members ?? []);
  }, [project.id, project.members]);

  useEffect(() => {
    setShowSettings(initialEntry === 'settings');
    setTab(initialEntry === 'settings' ? 'overview' : 'requirements');
    setRequirementsView('list');
    setSelectedRequirementId(null);
  }, [project.id, initialEntry]);

  useEffect(() => {
    let cancelled = false;
    void api.listProjectMembers(project.id).then(
      (res) => {
        if (cancelled) return;
        const items = res.items ?? [];
        setMembers(items);
        onProjectUpdated?.({ ...project, members: items });
      },
      () => { /* keep members from project detail on failure */ },
    );
    return () => { cancelled = true; };
  }, [project.id]);

  useEffect(() => {
    if (showSettings) return;
    if (tab !== 'overview' && tab !== 'requirements') return;
    let cancelled = false;
    const loadReqs = tab === 'requirements';
    if (tab === 'overview') setLoadingOverview(true);
    if (loadReqs) setLoadingRequirements(true);

    void api.listRequirements(project.id).then(
      (res) => {
        if (cancelled) return;
        const items = res.items ?? [];
        setRequirements(items);
        // Bug 已并入 requirements（item_type=BUG），概览统计直接从需求列表推导
        setBugs(
          items
            .filter((item) => item.item_type === 'BUG' || item.development_scope === 'BUG_FIX')
            .map((item) => ({
              id: item.id,
              project_id: item.project_id,
              requirement_id: item.parent_item_id ?? item.parent_requirement_id ?? item.id,
              bug_code: item.requirement_code,
              title: item.title,
              description: item.description ?? '',
              steps_to_reproduce: '',
              environment: '',
              severity: item.priority,
              status: item.current_status === 'CLOSED' ? 'CLOSED' : 'OPEN',
              found_in_status: '',
              assignee_user_id: item.developer_user_id,
              fix_requirement_id: item.id,
            })),
        );
      },
      () => {
        if (!cancelled) {
          setRequirements([]);
          setBugs([]);
        }
      },
    ).finally(() => {
      if (!cancelled) {
        if (tab === 'overview') setLoadingOverview(false);
        if (loadReqs) setLoadingRequirements(false);
      }
    });

    return () => { cancelled = true; };
  }, [project.id, tab, showSettings]);

  const currentMember = members.find((m) => m.user_id === currentUserId);
  const canManageMembers = currentMember ? isProjectManager(currentMember) : projectRole === 'PROJECT_ADMIN';

  const handleMembersChange = (nextMembers: typeof members) => {
    setMembers(nextMembers);
    onProjectUpdated?.({ ...project, members: nextMembers });
  };

  const lockedTabNotes: Partial<Record<ProjectTab, string>> = {
    repository: 'GitLab 代码仓库集成 Demo 暂未开放。',
  };

  const lockedTabs: ProjectTab[] = ['repository'];

  const selectedRequirement = requirements.find((r) => r.id === selectedRequirementId) ?? null;
  const viewingRequirement = requirements.find((r) => r.id === viewingRequirementId) ?? null;
  const inRequirementFlow = !showSettings && tab === 'requirements' && requirementsView !== 'list';

  const refreshRequirements = () => {
    void api.listRequirements(project.id).then(
      (res) => setRequirements(res.items ?? []),
      () => setRequirements([]),
    );
  };

  const openRequirementDetail = (requirementId: number) => {
    setSelectedRequirementId(requirementId);
    setRequirementsView('detail');
  };

  const handleRequirementUpdated = (updated: Requirement) => {
    setRequirements((prev) => {
      const exists = prev.some((item) => item.id === updated.id);
      if (exists) {
        return prev.map((item) => (item.id === updated.id ? updated : item));
      }
      return [updated, ...prev];
    });
    if (updated.parent_requirement_id == null) {
      refreshRequirements();
    }
  };

  const openSettings = () => {
    setShowSettings(true);
    setRequirementsView('list');
    setSelectedRequirementId(null);
  };

  const content = (() => {
    if (showSettings) {
      return (
        <ProjectSettingsPanel
          project={project}
          members={members}
          currentUserId={currentUserId}
          canManageMembers={canManageMembers}
          onProjectUpdated={(updated) => onProjectUpdated?.(updated)}
          onMembersChange={handleMembersChange}
          onProjectDeleted={() => onProjectDeleted?.() ?? onBack()}
        />
      );
    }

    if (lockedTabs.includes(tab)) {
      return (
        <div className="tsw-card tsw-empty">
          <h3>{PROJECT_TAB_LABELS[tab]}</h3>
          <p>{lockedTabNotes[tab] ?? '该模块 Demo 暂未开放，入口已保留。'}</p>
          <button type="button" className="tsw-btn tsw-btnPrimary" onClick={() => setLockedFeature(PROJECT_TAB_LABELS[tab])}>
            查看规划说明
          </button>
        </div>
      );
    }

    switch (tab) {
      case 'overview':
        return (
          <ProjectOverview
            project={project}
            members={members}
            requirements={requirements}
            bugs={bugs}
            loading={loadingOverview}
            onViewAllRequirements={() => setTab('requirements')}
            onViewAllMembers={() => setTab('members')}
          />
        );
      case 'requirements':
        if (requirementsView === 'create') {
          return (
            <CreateRequirementFlow
              project={project}
              existingRequirementCount={requirements.length}
              onCancel={() => setRequirementsView('list')}
              onCreated={(created) => {
                refreshRequirements();
                openRequirementDetail(created.id);
              }}
            />
          );
        }
        if (requirementsView === 'detail' && selectedRequirement) {
          return (
            <RequirementDetailView
              project={project}
              requirement={selectedRequirement}
              members={members}
              currentUserId={currentUserId}
              onBackToList={() => {
                setRequirementsView('list');
                setSelectedRequirementId(null);
              }}
              onOpenRequirement={(requirementId) => {
                void (async () => {
                  try {
                    const item = await api.getRequirement(requirementId);
                    setRequirements((prev) => {
                      const others = prev.filter((r) => r.id !== item.id);
                      return [item, ...others];
                    });
                  } catch {
                    refreshRequirements();
                  }
                  openRequirementDetail(requirementId);
                })();
              }}
              onRequirementUpdated={handleRequirementUpdated}
            />
          );
        }
        return (
          <RequirementListPanel
            requirements={requirements}
            members={members}
            loading={loadingRequirements}
            onCreate={() => setRequirementsView('create')}
            onOpen={openRequirementDetail}
            onView={setViewingRequirementId}
          />
        );
      case 'members':
        return (
          <div className="tsw-card">
            <ProjectMembersPanel
              projectId={project.id}
              members={members}
              ownerUserId={project.owner_user_id}
              currentUserId={currentUserId}
              canManage={canManageMembers}
              onMembersChange={handleMembersChange}
            />
          </div>
        );
      case 'documents':
        return (
          <WpsDocumentsPanel
            project={project}
            canManage={canManageMembers}
          />
        );
      case 'group':
        return (
          <WpsGroupChatPanel
            project={project}
            canManage={canManageMembers}
            onProjectUpdated={onProjectUpdated}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="tsw-projectWorkspace">
      <div className="tsw-breadcrumb">
        <button type="button" className="tsw-linkBtn" onClick={onBack}>项目列表</button>
        <span className="tsw-breadcrumbPath">
          <span className="tsw-breadcrumbSep">/</span>
          {project.name}
          {showSettings ? (
            <>
              <span className="tsw-breadcrumbSep">/</span>
              项目设置
            </>
          ) : null}
        </span>
      </div>

      {!inRequirementFlow ? (
      <header className="tsw-projectHeader">
        <button
          type="button"
          className="tsw-btn tsw-btnOutline tsw-projectSettingsBtn"
          onClick={openSettings}
        >
          ⚙ 项目设置
        </button>
        <div className="tsw-projectHeaderMain">
          <div className="tsw-projectHeaderTitleRow">
            <h2 className="tsw-projectHeaderTitle">{project.name}</h2>
          </div>
          <p className="tsw-projectHeaderDesc">
            {project.description || '暂无描述'}
          </p>
        </div>
      </header>
      ) : null}

      {!showSettings && !inRequirementFlow ? (
      <nav className="tsw-subNav">
        {(Object.keys(PROJECT_TAB_LABELS) as ProjectTab[]).map((key) => (
          <button
            key={key}
            type="button"
            className="tsw-subNavItem"
            data-active={tab === key ? 'true' : 'false'}
            onClick={() => {
              setTab(key);
              if (key !== 'requirements') {
                setRequirementsView('list');
                setSelectedRequirementId(null);
              }
            }}
          >
            {PROJECT_TAB_LABELS[key]}
          </button>
        ))}
      </nav>
      ) : null}
      {content}
      {!showSettings && tab !== 'overview' && tab !== 'requirements' && !inRequirementFlow ? (
        <>
          <div style={{ height: '14px' }} />
          <div className="tsw-card">
            <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>规划中能力</h3>
            <FeatureGrid onClickFeature={setLockedFeature} />
          </div>
        </>
      ) : null}
      {lockedFeature ? (
        <FeatureLockedDialog label={lockedFeature} onClose={() => setLockedFeature(null)} />
      ) : null}
      {viewingRequirement ? (
        <RequirementViewDialog
          requirement={viewingRequirement}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setViewingRequirementId(null)}
          onUpdated={handleRequirementUpdated}
        />
      ) : null}
    </div>
  );
}
