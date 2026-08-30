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

export const UNIQUE_REQUIREMENT_ROLE_HINT = '同一需求中，每人只能承担一种职能角色';

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
    'product_owner_user_id' | 'developer_user_id' | 'backend_developer_user_id' | 'tester_user_id'
  >,
  overrides?: Pick<RequirementRoleDraft, 'frontendUserId' | 'backendUserId' | 'testerUserId'>,
): RequirementRoleDraft {
  return {
    productOwnerUserId: requirement.product_owner_user_id,
    frontendUserId: overrides?.frontendUserId ?? requirement.developer_user_id,
    backendUserId: overrides?.backendUserId ?? requirement.backend_developer_user_id,
    testerUserId: overrides?.testerUserId ?? requirement.tester_user_id,
  };
}

export function findDuplicateRequirementRoleUser(
  assignments: RequirementRoleAssignment[],
): { userId: number; slots: RequirementRoleSlot[] } | null {
  const slotByUser = new Map<number, RequirementRoleSlot[]>();
  for (const item of assignments) {
    const slots = slotByUser.get(item.userId) ?? [];
    slots.push(item.slot);
    slotByUser.set(item.userId, slots);
  }
  for (const [userId, slots] of slotByUser) {
    if (slots.length > 1) {
      return { userId, slots };
    }
  }
  return null;
}

export function validateUniqueRequirementRoles(draft: RequirementRoleDraft): string | null {
  const duplicate = findDuplicateRequirementRoleUser(buildRequirementRoleAssignments(draft));
  if (!duplicate) return null;
  const labels = duplicate.slots.map((slot) => SLOT_LABELS[slot]).join('、');
  return `${UNIQUE_REQUIREMENT_ROLE_HINT}（该成员已担任：${labels}）`;
}

export function excludeUserIdsForDevAssignPicker(
  draft: RequirementRoleDraft,
  pickingSlot: 'frontend' | 'backend' | 'tester',
): number[] {
  const excluded = new Set<number>();
  if (draft.productOwnerUserId) excluded.add(draft.productOwnerUserId);
  if (pickingSlot !== 'frontend' && draft.frontendUserId) excluded.add(draft.frontendUserId);
  if (pickingSlot !== 'backend' && draft.backendUserId) excluded.add(draft.backendUserId);
  if (pickingSlot !== 'tester' && draft.testerUserId) excluded.add(draft.testerUserId);
  return [...excluded];
}

export function resolveUserRequirementRoleSlot(
  userId: number | undefined,
  draft: RequirementRoleDraft,
): RequirementRoleSlot | null {
  if (!userId) return null;
  if (draft.productOwnerUserId === userId) return 'PRODUCT_OWNER';
  if (draft.frontendUserId === userId) return 'FRONTEND_DEVELOPER';
  if (draft.backendUserId === userId) return 'BACKEND_DEVELOPER';
  if (draft.testerUserId === userId) return 'TESTER';
  return null;
}
