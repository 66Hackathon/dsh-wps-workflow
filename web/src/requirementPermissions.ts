import type { Requirement } from './types';

/** 当前用户是否为该需求的产品负责人（研发分配、产品文档等仅负责人可操作） */
export function isRequirementProductOwner(
  requirement: Pick<Requirement, 'product_owner_user_id'>,
  currentUserId?: number,
): boolean {
  if (!currentUserId || !requirement.product_owner_user_id) return false;
  return currentUserId === requirement.product_owner_user_id;
}

export const PRODUCT_OWNER_ONLY_HINT = '仅产品负责人可执行此操作';
