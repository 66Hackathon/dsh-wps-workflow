import type { RequirementRoleDraft } from './requirementRoles';
import { userHasRequirementRoleSlot } from './requirementRoles';
import type { ProjectMember, Requirement } from './types';

export type DevPhaseViewRole = 'developer' | 'product' | 'observer';
export type DevTrackKey = 'frontend' | 'backend';

export interface DevPhaseViewContext {
  role: DevPhaseViewRole;
  track?: DevTrackKey;
  viewLabel: string;
}

const VIEW_LABELS: Record<DevPhaseViewRole, string> = {
  developer: '研发视角',
  product: '产品视角',
  observer: '普通成员视角',
};

const TRACK_VIEW_LABELS: Record<DevTrackKey, string> = {
  frontend: '前端研发视图',
  backend: '后端研发视图',
};

export function resolveDevPhaseView(
  currentUserId: number | undefined,
  requirement: Requirement,
  _members: ProjectMember[],
  frontendUserId?: number,
  backendUserId?: number,
): DevPhaseViewContext {
  if (!currentUserId) {
    return { role: 'observer', viewLabel: VIEW_LABELS.observer };
  }

  const roleDraft: RequirementRoleDraft = {
    productOwnerUserId: requirement.created_by || requirement.product_owner_user_id,
    frontendUserId: frontendUserId ?? requirement.developer_user_id,
    backendUserId: backendUserId ?? requirement.backend_developer_user_id,
    testerUserId: requirement.tester_user_id,
  };

  // 兼任时优先按当前阶段职责：研发中以研发负责人身份操作
  if (userHasRequirementRoleSlot(currentUserId, roleDraft, 'FRONTEND_DEVELOPER')) {
    return {
      role: 'developer',
      track: 'frontend',
      viewLabel: TRACK_VIEW_LABELS.frontend,
    };
  }

  if (userHasRequirementRoleSlot(currentUserId, roleDraft, 'BACKEND_DEVELOPER')) {
    return {
      role: 'developer',
      track: 'backend',
      viewLabel: TRACK_VIEW_LABELS.backend,
    };
  }

  if (userHasRequirementRoleSlot(currentUserId, roleDraft, 'PRODUCT_OWNER')) {
    return { role: 'product', viewLabel: VIEW_LABELS.product };
  }

  return { role: 'observer', viewLabel: VIEW_LABELS.observer };
}
