import { useState } from 'react';
import type { Project } from '../types';
import type { RecentProjectVisit } from '../projectDisplay';
import { CREATE_PROJECT_STEPS } from '../workflow';
import { CreateProjectForm } from './CreateProjectForm';
import { CreateProjectStepper } from './CreateProjectStepper';
import { CreateProjectGroupStep } from './create/CreateProjectGroupStep';
import { CreateProjectMembersStep } from './create/CreateProjectMembersStep';
import { CreateProjectRepositoryStep } from './create/CreateProjectRepositoryStep';
import { ProjectList } from './ProjectList';

type ViewMode = 'list' | 'create';

interface Props {
  projects: Project[];
  loading: boolean;
  currentUserId?: number;
  recentVisits: RecentProjectVisit[];
  onSelectProject: (id: number) => void;
  onOpenProjectSettings: (id: number) => void;
  onProjectCreated: () => void;
}

export function ProjectFlowView({
  projects,
  loading,
  currentUserId,
  recentVisits,
  onSelectProject,
  onOpenProjectSettings,
  onProjectCreated,
}: Props) {
  const [mode, setMode] = useState<ViewMode>('list');
  const [activeStep, setActiveStep] = useState(0);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [memberCount, setMemberCount] = useState(1);
  const [repoLabel, setRepoLabel] = useState('未关联');

  const currentStep = CREATE_PROJECT_STEPS[activeStep] ?? CREATE_PROJECT_STEPS[0];

  const handleBackToList = () => {
    setMode('list');
    setActiveStep(0);
    setCreatedProject(null);
    setMemberCount(1);
    setRepoLabel('未关联');
  };

  const handleProjectCreated = (project: Project) => {
    setCreatedProject(project);
    setMemberCount(project.members?.length ?? 1);
    onProjectCreated();
  };

  if (mode === 'list') {
    return (
      <ProjectList
        projects={projects}
        loading={loading}
        currentUserId={currentUserId}
        recentVisits={recentVisits}
        onSelectProject={onSelectProject}
        onOpenProjectSettings={onOpenProjectSettings}
        onCreateClick={() => {
          setMode('create');
          setActiveStep(0);
          setCreatedProject(null);
          setMemberCount(1);
          setRepoLabel('未关联');
        }}
      />
    );
  }

  return (
    <div className="tsw-createProject">
      <h2 className="tsw-createProjectTitle">创建项目</h2>
      <CreateProjectStepper activeIndex={activeStep} />

      {currentStep.id === 'basic-info' ? (
        <CreateProjectForm
          onCreated={handleProjectCreated}
          onCancel={handleBackToList}
          onNext={() => setActiveStep(1)}
        />
      ) : null}

      {currentStep.id === 'members' && createdProject ? (
        <CreateProjectMembersStep
          project={createdProject}
          currentUserId={currentUserId}
          onPrev={() => setActiveStep(0)}
          onNext={(count) => {
            setMemberCount(count);
            setActiveStep(2);
          }}
        />
      ) : null}

      {currentStep.id === 'repository' && createdProject ? (
        <CreateProjectRepositoryStep
          project={createdProject}
          onPrev={() => setActiveStep(1)}
          onNext={(label) => {
            setRepoLabel(label);
            setActiveStep(3);
          }}
        />
      ) : null}

      {currentStep.id === 'group' && createdProject ? (
        <CreateProjectGroupStep
          project={createdProject}
          memberCount={memberCount}
          repoLabel={repoLabel}
          onPrev={() => setActiveStep(2)}
          onFinish={() => onSelectProject(createdProject.id)}
        />
      ) : null}
    </div>
  );
}
