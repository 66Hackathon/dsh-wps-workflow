import type { Requirement } from './types';

export type RequirementRoleSlot =
  | 'PRODUCT_OWNER'
  | 'FRONTEND_DEVELOPER'
  | 'BACKEND_DEVELOPER'
  | 'TESTER';

export interface RequirementRoleAssignment {
  slot: RequirementRoleSlot;
  userId: number;
}

export const UNIQUE_REQUIREMENT_ROLE_HINT = '同一需求中，产品 / 研发 / 测试可由同一人兼任';

const SLOT_LABELS: Record<RequirementRoleSlot, string> = {
  PRODUCT_OWNER: '产品负责人',
  FRONTEND_DEVELOPER: '前端负责人',
  BACKEND_DEVELOPER: '后端负责人',
  TESTER: '测试负责人',
};

export interface RequirementRoleDraft {
  productOwnerUserId?: number;
  frontendUserId?: number;
  backendUserId?: number;
  testerUserId?: number;
}

export function buildRequirementRoleAssignments(
  draft: RequirementRoleDraft,
): RequirementRoleAssignment[] {
  const items: RequirementRoleAssignment[] = [];
  if (draft.productOwnerUserId) {
    items.push({ slot: 'PRODUCT_OWNER', userId: draft.productOwnerUserId });
  }
  if (draft.frontendUserId) {
    items.push({ slot: 'FRONTEND_DEVELOPER', userId: draft.frontendUserId });
  }
  if (draft.backendUserId) {
    items.push({ slot: 'BACKEND_DEVELOPER', userId: draft.backendUserId });
  }
  if (draft.testerUserId) {
    items.push({ slot: 'TESTER', userId: draft.testerUserId });
  }
  return items;
}

export function requirementRoleDraftFromRequirement(
  requirement: Pick<
    Requirement,
    'created_by' | 'product_owner_user_id' | 'developer_user_id' | 'backend_developer_user_id' | 'tester_user_id'
  >,
  overrides?: Pick<RequirementRoleDraft, 'frontendUserId' | 'backendUserId' | 'testerUserId'>,
): RequirementRoleDraft {
  return {
    productOwnerUserId: requirement.created_by || requirement.product_owner_user_id,
    frontendUserId: overrides?.frontendUserId ?? requirement.developer_user_id,
    backendUserId: overrides?.backendUserId ?? requirement.backend_developer_user_id,
    testerUserId: overrides?.testerUserId ?? requirement.tester_user_id,
  };
}

export function findDuplicateRequirementRoleUser(
  _assignments: RequirementRoleAssignment[],
): { userId: number; slots: RequirementRoleSlot[] } | null {
  // 允许同一人兼任产品 / 研发 / 测试
  return null;
}

export function validateUniqueRequirementRoles(_draft: RequirementRoleDraft): string | null {
  return null;
}

export function excludeUserIdsForDevAssignPicker(
  _draft: RequirementRoleDraft,
  _pickingSlot: 'frontend' | 'backend' | 'tester',
): number[] {
  return [];
}

/** 返回用户在该需求上匹配的全部职能角色（可兼任） */
export function resolveUserRequirementRoleSlots(
  userId: number | undefined,
  draft: RequirementRoleDraft,
): RequirementRoleSlot[] {
  if (!userId) return [];
  const slots: RequirementRoleSlot[] = [];
  if (draft.productOwnerUserId === userId) slots.push('PRODUCT_OWNER');
  if (draft.frontendUserId === userId) slots.push('FRONTEND_DEVELOPER');
  if (draft.backendUserId === userId) slots.push('BACKEND_DEVELOPER');
  if (draft.testerUserId === userId) slots.push('TESTER');
  return slots;
}

export function resolveUserRequirementRoleSlot(
  userId: number | undefined,
  draft: RequirementRoleDraft,
): RequirementRoleSlot | null {
  return resolveUserRequirementRoleSlots(userId, draft)[0] ?? null;
}

export function userHasRequirementRoleSlot(
  userId: number | undefined,
  draft: RequirementRoleDraft,
  slot: RequirementRoleSlot,
): boolean {
  return resolveUserRequirementRoleSlots(userId, draft).includes(slot);
}

export function requirementRoleSlotLabel(slot: RequirementRoleSlot): string {
  return SLOT_LABELS[slot];
}
