import { formatRelativeFromISO } from './projectDisplay';
import { isBugFixRequirement } from './requirementDisplay';
import { REQUIREMENT_STATUS_LABELS } from './types';
import type { Bug, ProjectMember, Requirement } from './types';

export interface OverviewStatCard {
  key: string;
  label: string;
  value: number;
  hint?: string;
  tone: 'neutral' | 'orange' | 'blue' | 'purple' | 'red' | 'green' | 'gray';
}

export interface PhaseSegment {
  key: string;
  label: string;
  count: number;
  color: string;
}

export interface ActivityItem {
  id: string;
  text: string;
  tone: 'blue' | 'green' | 'orange' | 'purple' | 'red';
  timeLabel: string;
}

const PHASE_COLORS: Record<string, string> = {
  product: '#f59e0b',
  design: '#0ea5e9',
  dev: '#2563eb',
  test: '#8b5cf6',
  acceptance: '#ec4899',
  regression: '#a855f7',
  done: '#16a34a',
  archived: '#94a3b8',
};

const PRODUCT_STATUSES = ['CREATED', 'PRODUCT_DESIGN'];
const DEV_DESIGN_STATUSES = ['DEV_DESIGN'];
const DEV_STATUSES = ['DEVELOPMENT'];
const TEST_STATUSES = ['TESTING'];
const ACCEPTANCE_STATUSES = ['PRODUCT_ACCEPTANCE'];
const REGRESSION_STATUSES = ['REGRESSION'];
const DONE_STATUSES = ['CLOSED', 'ARCHIVED'];

export function overviewStatusLabel(status: string): string {
  return REQUIREMENT_STATUS_LABELS[status] ?? status;
}

export function overviewStatusTone(status: string): OverviewStatCard['tone'] {
  switch (status) {
    case 'CREATED':
    case 'PRODUCT_DESIGN':
      return 'orange';
    case 'DEV_DESIGN':
    case 'DEVELOPMENT':
      return 'blue';
    case 'TESTING':
    case 'REGRESSION':
      return 'purple';
    case 'PRODUCT_ACCEPTANCE':
      return 'orange';
    case 'CLOSED':
    case 'ARCHIVED':
      return 'gray';
    default:
      return 'neutral';
  }
}

function countByStatus(requirements: Requirement[], statuses: string[]): number {
  const set = new Set(statuses);
  return requirements.filter((r) => set.has(r.current_status)).length;
}

function openBugItems(requirements: Requirement[], bugs: Bug[]): Requirement[] {
  const fromRequirements = requirements.filter(
    (r) => isBugFixRequirement(r) && r.current_status !== 'CLOSED' && r.current_status !== 'ARCHIVED',
  );
  if (fromRequirements.length || !bugs.length) return fromRequirements;
  // 兼容旧 Bug 列表接口（若仍返回数据）
  return [];
}

export function buildOverviewStats(requirements: Requirement[], bugs: Bug[]): OverviewStatCard[] {
  const mainRequirements = requirements.filter((r) => !isBugFixRequirement(r));
  const openBugs = openBugItems(requirements, bugs);
  const openBugCount = openBugs.length || bugs.filter((b) => b.status.toUpperCase() === 'OPEN').length;

  return [
    { key: 'all', label: '全部需求', value: mainRequirements.length, tone: 'neutral' },
    {
      key: 'product',
      label: '产品设计中',
      value: countByStatus(mainRequirements, PRODUCT_STATUSES),
      tone: 'orange',
    },
    {
      key: 'dev',
      label: '研发中',
      value: countByStatus(mainRequirements, [...DEV_DESIGN_STATUSES, ...DEV_STATUSES]),
      tone: 'blue',
    },
    {
      key: 'test',
      label: '测试中',
      value: countByStatus(mainRequirements, TEST_STATUSES),
      tone: 'purple',
    },
    {
      key: 'bug',
      label: 'Bug 处理中',
      value: openBugCount,
      hint: openBugCount ? `${openBugCount} 个未关闭 Bug` : undefined,
      tone: 'red',
    },
    {
      key: 'acceptance',
      label: '待产品验收',
      value: countByStatus(mainRequirements, ACCEPTANCE_STATUSES),
      tone: 'orange',
    },
    {
      key: 'done',
      label: '已完成',
      value: countByStatus(mainRequirements, DONE_STATUSES),
      tone: 'green',
    },
  ];
}

export function buildPhaseSegments(requirements: Requirement[]): PhaseSegment[] {
  const mainRequirements = requirements.filter((r) => !isBugFixRequirement(r));
  const segments: PhaseSegment[] = [
    {
      key: 'product',
      label: '产品',
      count: countByStatus(mainRequirements, PRODUCT_STATUSES),
      color: PHASE_COLORS.product,
    },
    {
      key: 'design',
      label: '方案',
      count: countByStatus(mainRequirements, DEV_DESIGN_STATUSES),
      color: PHASE_COLORS.design,
    },
    {
      key: 'dev',
      label: '研发',
      count: countByStatus(mainRequirements, DEV_STATUSES),
      color: PHASE_COLORS.dev,
    },
    {
      key: 'test',
      label: '测试',
      count: countByStatus(mainRequirements, TEST_STATUSES),
      color: PHASE_COLORS.test,
    },
    {
      key: 'acceptance',
      label: '验收',
      count: countByStatus(mainRequirements, ACCEPTANCE_STATUSES),
      color: PHASE_COLORS.acceptance,
    },
    {
      key: 'regression',
      label: '回归',
      count: countByStatus(mainRequirements, REGRESSION_STATUSES),
      color: PHASE_COLORS.regression,
    },
    {
      key: 'done',
      label: '完成',
      count: countByStatus(mainRequirements, DONE_STATUSES),
      color: PHASE_COLORS.done,
    },
  ];
  return segments.filter((s) => s.count > 0);
}

export function resolveRequirementOwner(
  req: Requirement,
  members: ProjectMember[],
): string {
  const memberMap = new Map(members.map((m) => [m.user_id, m.user_name]));
  const pick = (id?: number) => (id ? memberMap.get(id) : undefined);
  switch (req.current_status) {
    case 'DEV_DESIGN':
    case 'DEVELOPMENT':
      return pick(req.developer_user_id) ?? pick(req.backend_developer_user_id) ?? pick(req.created_by) ?? '—';
    case 'TESTING':
    case 'REGRESSION':
      return pick(req.tester_user_id) ?? pick(req.developer_user_id) ?? '—';
    case 'PRODUCT_ACCEPTANCE':
      return pick(req.created_by) ?? pick(req.product_owner_user_id) ?? '—';
    default:
      return pick(req.created_by) ?? pick(req.product_owner_user_id) ?? pick(req.developer_user_id) ?? '—';
  }
}

function activityToneForStatus(status: string): ActivityItem['tone'] {
  switch (status) {
    case 'DEVELOPMENT':
    case 'DEV_DESIGN':
      return 'green';
    case 'TESTING':
    case 'REGRESSION':
      return 'purple';
    case 'PRODUCT_ACCEPTANCE':
      return 'orange';
    case 'CLOSED':
      return 'red';
    default:
      return 'blue';
  }
}

function activityText(
  req: Requirement,
  actor: string,
): string {
  const kind = isBugFixRequirement(req) ? 'Bug' : '需求';
  switch (req.current_status) {
    case 'CREATED':
    case 'PRODUCT_DESIGN':
      return `${actor} 推进了产品设计 · ${req.title}`;
    case 'DEV_DESIGN':
      return `${actor} 提交了研发方案 · ${req.title}`;
    case 'DEVELOPMENT':
      return isBugFixRequirement(req)
        ? `${actor} 正在修复 ${kind} · ${req.title}`
        : `${actor} 推进了研发 · ${req.title}`;
    case 'TESTING':
      return `${actor} 提交了测试进展 · ${req.title}`;
    case 'PRODUCT_ACCEPTANCE':
      return `${actor} 进入产品验收 · ${req.title}`;
    case 'REGRESSION':
      return `${actor} 进入回归测试 · ${req.title}`;
    case 'CLOSED':
      return `${actor} 关闭了${kind} · ${req.title}`;
    default:
      return `${actor} 更新了${kind} · ${req.title}`;
  }
}

export function buildActivityFeed(
  requirements: Requirement[],
  members: ProjectMember[],
): ActivityItem[] {
  const memberMap = new Map(members.map((m) => [m.user_id, m.user_name]));
  const sorted = [...requirements].sort((a, b) => {
    const ta = Date.parse(a.updated_at ?? '') || 0;
    const tb = Date.parse(b.updated_at ?? '') || 0;
    return tb - ta;
  });

  return sorted.slice(0, 6).map((req) => {
    const ownerName = resolveRequirementOwner(req, members);
    const creator = memberMap.get(req.created_by ?? req.product_owner_user_id ?? 0) ?? '成员';
    const actor = ownerName !== '—' ? ownerName : creator;
    return {
      id: `req-${req.id}-${req.current_status}`,
      text: activityText(req, actor),
      tone: activityToneForStatus(req.current_status),
      timeLabel: formatRelativeFromISO(req.updated_at),
    };
  });
}
