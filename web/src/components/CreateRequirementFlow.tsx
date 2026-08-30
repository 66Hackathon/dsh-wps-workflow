import { useState } from 'react';
import type { Project, Requirement } from '../types';
import { CREATE_REQUIREMENT_STEPS } from '../workflow';
import { CreateProjectStepper } from './CreateProjectStepper';
import { CreateRequirementDocStep } from './create/CreateRequirementDocStep';
import { CreateRequirementInfoStep } from './create/CreateRequirementInfoStep';
import { CreateRequirementOwnerStep } from './create/CreateRequirementOwnerStep';
import { createEmptyRequirementDraft, type RequirementDraft } from '../requirementCreate';

interface Props {
  project: Project;
  existingRequirementCount: number;
  onCancel: () => void;
  onCreated: (requirement: Requirement) => void;
}

export function CreateRequirementFlow({
  project,
  existingRequirementCount,
  onCancel,
  onCreated,
}: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [draft, setDraft] = useState<RequirementDraft>(() => createEmptyRequirementDraft());
  const [finished, setFinished] = useState(false);

  const currentStep = CREATE_REQUIREMENT_STEPS[activeStep] ?? CREATE_REQUIREMENT_STEPS[0];

  const handleCreated = (requirement: Requirement) => {
    setFinished(true);
    onCreated(requirement);
  };

  return (
    <div className="tsw-createProject tsw-createProjectWide">
      <div className="tsw-breadcrumb">
        <button type="button" className="tsw-linkBtn" onClick={onCancel}>
          ← 需求列表
        </button>
        <span className="tsw-breadcrumbPath">
          项目空间
          <span className="tsw-breadcrumbSep">/</span>
          {project.name}
          <span className="tsw-breadcrumbSep">/</span>
          创建需求
        </span>
      </div>

      <h2 className="tsw-createProjectTitle">创建需求</h2>
      <CreateProjectStepper
        activeIndex={activeStep}
        steps={CREATE_REQUIREMENT_STEPS}
        ariaLabel="创建需求步骤"
      />

      {currentStep.id === 'info' ? (
        <CreateRequirementInfoStep
          draft={draft}
          onChange={setDraft}
          onCancel={onCancel}
          onNext={() => setActiveStep(1)}
        />
      ) : null}

      {currentStep.id === 'owner' ? (
        <CreateRequirementOwnerStep
          projectId={project.id}
          draft={draft}
          onChange={setDraft}
          onPrev={() => setActiveStep(0)}
          onNext={() => setActiveStep(2)}
        />
      ) : null}

      {currentStep.id === 'document' ? (
        <CreateRequirementDocStep
          project={project}
          draft={draft}
          existingRequirementCount={existingRequirementCount}
          onPrev={() => setActiveStep(1)}
          onCreated={handleCreated}
        />
      ) : null}

      {finished ? (
        <div className="tsw-createFooter tsw-createFooterCentered" style={{ marginTop: 16 }}>
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onCancel}>
            返回需求列表
          </button>
        </div>
      ) : null}
    </div>
  );
}
