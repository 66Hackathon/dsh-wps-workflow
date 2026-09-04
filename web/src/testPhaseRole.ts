import type { RequirementRoleDraft } from './requirementRoles';
import { userHasRequirementRoleSlot } from './requirementRoles';
import type { ProjectMember, Requirement } from './types';

export type TestPhaseViewRole = 'tester' | 'product' | 'developer' | 'observer';
export type TestDevTrackKey = 'frontend' | 'backend';

export interface TestPhaseViewContext {
  role: TestPhaseViewRole;
  track?: TestDevTrackKey;
  viewLabel: string;
  canAdvance: boolean;
}

const VIEW_LABELS: Record<TestPhaseViewRole, string> = {
  tester: '测试人员视图',
  product: '产品视角',
  developer: '研发视角',
  observer: '普通成员视角',
};

const TRACK_VIEW_LABELS: Record<TestDevTrackKey, string> = {
  frontend: '前端研发视图',
  backend: '后端研发视图',
};

export function resolveTestPhaseView(
  currentUserId: number | undefined,
  requirement: Requirement,
  _members: ProjectMember[],
  frontendUserId?: number,
  backendUserId?: number,
): TestPhaseViewContext {
  if (!currentUserId) {
    return {
      role: 'observer',
      viewLabel: VIEW_LABELS.observer,
      canAdvance: false,
    };
  }

  const roleDraft: RequirementRoleDraft = {
    productOwnerUserId: requirement.created_by || requirement.product_owner_user_id,
    frontendUserId: frontendUserId ?? requirement.developer_user_id,
    backendUserId: backendUserId ?? requirement.backend_developer_user_id,
    testerUserId: requirement.tester_user_id,
  };

  // 兼任时优先按当前阶段职责：测试中以测试负责人身份操作
  if (userHasRequirementRoleSlot(currentUserId, roleDraft, 'TESTER')) {
    return {
      role: 'tester',
      viewLabel: VIEW_LABELS.tester,
      canAdvance: true,
    };
  }

  if (userHasRequirementRoleSlot(currentUserId, roleDraft, 'FRONTEND_DEVELOPER')) {
    return {
      role: 'developer',
      track: 'frontend',
      viewLabel: TRACK_VIEW_LABELS.frontend,
      canAdvance: false,
    };
  }

  if (userHasRequirementRoleSlot(currentUserId, roleDraft, 'BACKEND_DEVELOPER')) {
    return {
      role: 'developer',
      track: 'backend',
      viewLabel: TRACK_VIEW_LABELS.backend,
      canAdvance: false,
    };
  }

  if (userHasRequirementRoleSlot(currentUserId, roleDraft, 'PRODUCT_OWNER')) {
    return {
      role: 'product',
      viewLabel: VIEW_LABELS.product,
      canAdvance: false,
    };
  }

  return {
    role: 'observer',
    viewLabel: VIEW_LABELS.observer,
    canAdvance: false,
  };
}
