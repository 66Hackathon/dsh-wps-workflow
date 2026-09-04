import type { Requirement } from './types';

/** 创建者即为产品负责人 */
export function requirementProductOwnerId(
  requirement: Pick<Requirement, 'created_by' | 'product_owner_user_id'>,
): number | undefined {
  return requirement.created_by || requirement.product_owner_user_id;
}

/** 当前用户是否为该需求的产品负责人（创建者） */
export function isRequirementProductOwner(
  requirement: Pick<Requirement, 'created_by' | 'product_owner_user_id'>,
  currentUserId?: number,
): boolean {
  const ownerId = requirementProductOwnerId(requirement);
  if (!currentUserId || !ownerId) return false;
  return currentUserId === ownerId;
}

/** 当前用户是否为该需求的研发负责人 */
export function isRequirementDeveloper(
  requirement: Pick<Requirement, 'developer_user_id' | 'backend_developer_user_id'>,
  currentUserId?: number,
): boolean {
  if (!currentUserId) return false;
  return currentUserId === requirement.developer_user_id
    || currentUserId === requirement.backend_developer_user_id;
}

export const PRODUCT_OWNER_ONLY_HINT = '仅产品负责人可执行此操作';
export const DEVELOPER_ONLY_HINT = '仅研发负责人可执行此操作';
