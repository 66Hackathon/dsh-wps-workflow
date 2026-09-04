import type { Requirement } from './types';

/** 需求详情页阶段条 */
export interface RequirementPhaseStep {
  id: string;
  title: string;
  statuses: string[];
}

/** 各阶段默认负责人：产品 / 研发 / 测试 */
export type RequirementPhaseOwnerRole = 'product' | 'developer' | 'tester';

export const REQUIREMENT_PHASE_OWNER_ROLE: Record<string, RequirementPhaseOwnerRole> = {
  'product-design': 'product',
  'dev-design': 'developer',
  development: 'developer',
  testing: 'tester',
  acceptance: 'product',
  regression: 'tester',
  closed: 'product',
};

export const REQUIREMENT_PHASE_OWNER_ROLE_LABEL: Record<RequirementPhaseOwnerRole, string> = {
  product: '产品负责人',
  developer: '研发负责人',
  tester: '测试负责人',
};

export function resolveRequirementPhaseOwnerRole(stepId: string): RequirementPhaseOwnerRole | undefined {
  return REQUIREMENT_PHASE_OWNER_ROLE[stepId];
}

export function resolveRequirementPhaseOwnerUserId(
  stepId: string,
  requirement: Requirement,
): number | undefined {
  const role = resolveRequirementPhaseOwnerRole(stepId);
  const productOwnerId = requirement.created_by || requirement.product_owner_user_id;
  switch (role) {
    case 'product':
      return productOwnerId || undefined;
    case 'developer':
      return requirement.developer_user_id || requirement.backend_developer_user_id || undefined;
    case 'tester':
      return requirement.tester_user_id || undefined;
    default:
      return undefined;
  }
}

export const REQUIREMENT_PHASE_STEPS: RequirementPhaseStep[] = [
  { id: 'product-design', title: '产品设计', statuses: ['CREATED', 'PRODUCT_DESIGN'] },
  { id: 'dev-design', title: '研发方案', statuses: ['DEV_DESIGN'] },
  { id: 'development', title: '研发中', statuses: ['DEVELOPMENT'] },
  { id: 'testing', title: '测试中', statuses: ['TESTING'] },
  { id: 'acceptance', title: '产品验收', statuses: ['PRODUCT_ACCEPTANCE'] },
  { id: 'regression', title: '回归测试', statuses: ['REGRESSION'] },
  { id: 'closed', title: '已关闭', statuses: ['CLOSED'] },
];

/** 详情页状态徽章文案 */
export const REQUIREMENT_PHASE_BADGE: Record<string, string> = {
  CREATED: '产品设计',
  PRODUCT_DESIGN: '产品设计',
  DEV_DESIGN: '研发方案',
  DEVELOPMENT: '研发中',
  TESTING: '测试中',
  PRODUCT_ACCEPTANCE: '产品验收',
  REGRESSION: '回归测试',
  CLOSED: '已关闭',
};

export function resolveRequirementPhaseIndex(status: string): number {
  if (status === 'CLOSED') return REQUIREMENT_PHASE_STEPS.length - 1;
  const idx = REQUIREMENT_PHASE_STEPS.findIndex((step) => step.statuses.includes(status));
  return idx >= 0 ? idx : 0;
}

export type RequirementPhaseStepState = 'completed' | 'current' | 'upcoming';

export function resolveRequirementPhaseStates(status: string): RequirementPhaseStepState[] {
  const activeIndex = resolveRequirementPhaseIndex(status);
  if (status === 'CLOSED') {
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
  'product-design': 'PRODUCT_DESIGN',
  'dev-design': 'DEV_DESIGN',
  development: 'DEVELOPMENT',
  testing: 'TESTING',
  acceptance: 'PRODUCT_ACCEPTANCE',
  regression: 'REGRESSION',
};

/** 进入某阶段节点时的需求 status */
export const REQUIREMENT_STEP_ENTRY_STATUS: Record<string, string> = {
  'product-design': 'PRODUCT_DESIGN',
  'dev-design': 'DEV_DESIGN',
  development: 'DEVELOPMENT',
  testing: 'TESTING',
  acceptance: 'PRODUCT_ACCEPTANCE',
  regression: 'REGRESSION',
  closed: 'CLOSED',
};

export function requirementStepStageCode(stepId: string): string | undefined {
  return REQUIREMENT_STEP_STAGE_CODE[stepId];
}

export function isRequirementStepReachable(stepIndex: number, currentStatus: string): boolean {
  const currentIndex = resolveRequirementPhaseIndex(currentStatus);
  if (currentStatus === 'CLOSED') return true;
  return stepIndex <= currentIndex;
}
