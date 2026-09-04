import type { ProjectMember, Requirement } from './types';
import { REQUIREMENT_STATUS_LABELS } from './types';

export type RequirementLifecycleFilter = 'all' | 'active' | 'archived';
export type RequirementKindFilter = 'all' | 'requirement' | 'bug';

export const REQUIREMENT_LIFECYCLE_FILTERS: { key: RequirementLifecycleFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'archived', label: '已结束' },
];

export const REQUIREMENT_KIND_FILTERS: { key: RequirementKindFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'requirement', label: '仅需求' },
  { key: 'bug', label: '仅Bug' },
];

export function isBugFixRequirement(req: Requirement): boolean {
  return req.item_type === 'BUG' || req.development_scope === 'BUG_FIX';
}

/** 已结束：关闭或历史归档状态 */
export function isArchivedRequirement(req: Requirement): boolean {
  const status = req.current_status.toUpperCase();
  return status === 'CLOSED' || status === 'ARCHIVED';
}

export function matchesRequirementLifecycle(
  req: Requirement,
  filter: RequirementLifecycleFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'archived') return isArchivedRequirement(req);
  return !isArchivedRequirement(req);
}

export function matchesRequirementKind(req: Requirement, filter: RequirementKindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'bug') return isBugFixRequirement(req);
  return !isBugFixRequirement(req);
}

export function requirementOwnerIds(req: Requirement): number[] {
  return [
    req.created_by,
    req.product_owner_user_id,
    req.developer_user_id,
    req.backend_developer_user_id,
    req.tester_user_id,
  ].filter((id): id is number => typeof id === 'number' && id > 0);
}

export function filterRequirements(
  requirements: Requirement[],
  query: string,
  lifecycle: RequirementLifecycleFilter,
  kind: RequirementKindFilter,
  assigneeUserId?: number,
  members: ProjectMember[] = [],
): Requirement[] {
  const q = query.trim().toLowerCase();
  return requirements.filter((req) => {
    if (!matchesRequirementLifecycle(req, lifecycle)) return false;
    if (!matchesRequirementKind(req, kind)) return false;
    if (assigneeUserId && !requirementOwnerIds(req).includes(assigneeUserId)) return false;
    if (!q) return true;
    const ownerNames = requirementOwnerIds(req)
      .map((id) => members.find((m) => m.user_id === id)?.user_name ?? '')
      .join(' ')
      .toLowerCase();
    return (
      req.title.toLowerCase().includes(q)
      || req.requirement_code.toLowerCase().includes(q)
      || (req.description ?? '').toLowerCase().includes(q)
      || ownerNames.includes(q)
    );
  });
}

export function requirementKindLabel(req: Requirement): string {
  return isBugFixRequirement(req) ? 'Bug' : '需求';
}

export function requirementStatusTone(status: string): 'blue' | 'orange' | 'cyan' | 'green' | 'gray' | 'purple' {
  switch (status) {
    case 'DEV_DESIGN':
    case 'DEVELOPMENT':
      return 'blue';
    case 'TESTING':
      return 'cyan';
    case 'PRODUCT_ACCEPTANCE':
      return 'green';
    case 'CLOSED':
    case 'ARCHIVED':
      return 'gray';
    case 'REGRESSION':
      return 'purple';
    case 'CREATED':
    case 'PRODUCT_DESIGN':
    default:
      return 'orange';
  }
}

export function requirementStatusLabel(status: string): string {
  return REQUIREMENT_STATUS_LABELS[status] ?? status;
}

export function countRequirementsByLifecycle(items: Requirement[], filter: RequirementLifecycleFilter): number {
  return items.filter((req) => matchesRequirementLifecycle(req, filter)).length;
}

export function countRequirementsByKind(items: Requirement[], filter: RequirementKindFilter): number {
  return items.filter((req) => matchesRequirementKind(req, filter)).length;
}
