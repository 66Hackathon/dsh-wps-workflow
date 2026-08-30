import { CREATE_PROJECT_STEPS } from '../workflow';

interface StepDef {
  id: string;
  title: string;
}

interface Props {
  activeIndex: number;
  steps?: StepDef[];
  ariaLabel?: string;
}

export function CreateProjectStepper({
  activeIndex,
  steps = CREATE_PROJECT_STEPS,
  ariaLabel = '创建项目步骤',
}: Props) {
  return (
    <nav className="tsw-createStepper" aria-label={ariaLabel}>
      <ol className="tsw-createStepList">
        {steps.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isCurrent = index === activeIndex;
          return (
            <li
              key={step.id}
              className="tsw-createStepItem"
              data-completed={isCompleted ? 'true' : 'false'}
              data-current={isCurrent ? 'true' : 'false'}
            >
              <span className="tsw-createStepDot" aria-hidden="true">
                {isCompleted ? '✓' : index + 1}
              </span>
              <span className="tsw-createStepLabel">{step.title}</span>
              {index < steps.length - 1 ? (
                <span className="tsw-createStepLine" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
