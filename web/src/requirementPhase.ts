/** 需求详情页阶段条（设计稿 §产品阶段） */
export interface RequirementPhaseStep {
  id: string;
  title: string;
  statuses: string[];
}

export const REQUIREMENT_PHASE_STEPS: RequirementPhaseStep[] = [
  { id: 'product-design', title: '产品设计中', statuses: ['PRODUCT_EDITING'] },
  { id: 'dev-assign', title: '待研发分配', statuses: ['PRODUCT_REVIEW'] },
  { id: 'development', title: '研发中', statuses: ['DEVELOPMENT'] },
  { id: 'testing', title: '测试中', statuses: ['TESTING', 'BUG_FIXING'] },
  { id: 'acceptance', title: '待验收', statuses: ['DONE'] },
];

/** 详情页状态徽章文案 */
export const REQUIREMENT_PHASE_BADGE: Record<string, string> = {
  PRODUCT_EDITING: '产品设计中',
  PRODUCT_REVIEW: '待研发分配',
  DEVELOPMENT: '研发中',
  TESTING: '测试中',
  BUG_FIXING: 'Bug修复中',
  DONE: '待验收',
  ARCHIVED: '已归档',
};

export function resolveRequirementPhaseIndex(status: string): number {
  if (status === 'ARCHIVED') return REQUIREMENT_PHASE_STEPS.length;
  const idx = REQUIREMENT_PHASE_STEPS.findIndex((step) => step.statuses.includes(status));
  return idx >= 0 ? idx : 0;
}

export type RequirementPhaseStepState = 'completed' | 'current' | 'upcoming';

export function resolveRequirementPhaseStates(status: string): RequirementPhaseStepState[] {
  const activeIndex = resolveRequirementPhaseIndex(status);
  if (status === 'ARCHIVED') {
    return REQUIREMENT_PHASE_STEPS.map(() => 'completed');
  }
  return REQUIREMENT_PHASE_STEPS.map((_, index) => {
    if (index < activeIndex) return 'completed';
    if (index === activeIndex) return 'current';
    return 'upcoming';
  });
}

/** 阶段条节点 id → 阶段提交 stage_code */
export const REQUIREMENT_STEP_STAGE_CODE: Record<string, string> = {
  'product-design': 'PRODUCT_EDITING',
  'dev-assign': 'PRODUCT_REVIEW',
  development: 'DEVELOPMENT',
  testing: 'TESTING',
  acceptance: 'DONE',
};

/** 进入某阶段节点时的需求 status */
export const REQUIREMENT_STEP_ENTRY_STATUS: Record<string, string> = {
  'product-design': 'PRODUCT_EDITING',
  'dev-assign': 'PRODUCT_REVIEW',
  development: 'DEVELOPMENT',
  testing: 'TESTING',
  acceptance: 'DONE',
};

export function requirementStepStageCode(stepId: string): string | undefined {
  return REQUIREMENT_STEP_STAGE_CODE[stepId];
}

export function isRequirementStepReachable(stepIndex: number, currentStatus: string): boolean {
  const currentIndex = resolveRequirementPhaseIndex(currentStatus);
  if (currentStatus === 'ARCHIVED') return true;
  return stepIndex <= currentIndex;
}
