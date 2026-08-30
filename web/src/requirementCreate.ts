export type RequirementPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type RequirementType =
  | 'FUNCTIONAL'
  | 'NON_FUNCTIONAL'
  | 'TECH_DEBT'
  | 'BUG_FIX';

export interface RequirementDraft {
  title: string;
  description: string;
  priority: RequirementPriority;
  requirementType: RequirementType;
  plannedStart: string;
  plannedEnd: string;
  acceptanceCriteria: string;
  productOwnerUserId?: number;
  watcherUserIds?: number[];
}

export const REQUIREMENT_PRIORITY_OPTIONS: { value: RequirementPriority; label: string }[] = [
  { value: 'HIGH', label: '高' },
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'URGENT', label: '紧急' },
];

export const REQUIREMENT_TYPE_OPTIONS: { value: RequirementType; label: string }[] = [
  { value: 'FUNCTIONAL', label: '功能需求' },
  { value: 'NON_FUNCTIONAL', label: '非功能需求' },
  { value: 'TECH_DEBT', label: '技术债' },
  { value: 'BUG_FIX', label: '缺陷修复' },
];

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
};

export function createEmptyRequirementDraft(): RequirementDraft {
  return {
    title: '',
    description: '',
    priority: 'HIGH',
    requirementType: 'FUNCTIONAL',
    plannedStart: '',
    plannedEnd: '',
    acceptanceCriteria: '',
  };
}

export function suggestRequirementCode(projectCode: string, existingCount: number): string {
  const base = projectCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'REQ';
  const seq = String(existingCount + 1).padStart(3, '0');
  return `REQ-${base}-${seq}`;
}
