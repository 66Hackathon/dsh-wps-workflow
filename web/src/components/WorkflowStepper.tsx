import type { WorkflowStepDef, WorkflowStepStatus } from '../workflow';

interface Props {
  steps: WorkflowStepDef[];
  statuses: WorkflowStepStatus[];
  activeIndex: number;
  onSelectStep?: (index: number) => void;
}

function statusLabel(status: WorkflowStepStatus): string {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'current':
      return '进行中';
    case 'upcoming':
      return '下一步';
    default:
      return '待开放';
  }
}

export function WorkflowStepper({ steps, statuses, activeIndex, onSelectStep }: Props) {
  return (
    <nav className="tsw-workflowStepper" aria-label="协作流程">
      <ol className="tsw-workflowStepList">
        {steps.map((step, index) => {
          const status = statuses[index] ?? 'locked';
          const isActive = index === activeIndex;
          return (
            <li key={step.id} className="tsw-workflowStepItem">
              <button
                type="button"
                className="tsw-workflowStepBtn"
                data-status={status}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => onSelectStep?.(index)}
                disabled={!onSelectStep || status === 'locked'}
              >
                <span className="tsw-workflowStepIndex" aria-hidden="true">
                  {status === 'completed' ? '✓' : index + 1}
                </span>
                <span className="tsw-workflowStepText">
                  <span className="tsw-workflowStepTitle">{step.title}</span>
                  <span className="tsw-workflowStepMeta">{statusLabel(status)}</span>
                </span>
              </button>
              {index < steps.length - 1 ? (
                <span className="tsw-workflowStepConnector" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
