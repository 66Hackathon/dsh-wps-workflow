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
  dev: '#2563eb',
  test: '#8b5cf6',
  pending: '#ec4899',
  done: '#16a34a',
  archived: '#94a3b8',
};

export function overviewStatusLabel(status: string): string {
  switch (status) {
    case 'PRODUCT_EDITING':
    case 'PRODUCT_REVIEW':
      return '产品细化中';
    case 'DEVELOPMENT':
      return '研发中';
    case 'TESTING':
      return '测试中';
    case 'BUG_FIXING':
      return 'Bug修复中';
    case 'DONE':
      return '已完成';
    case 'CLOSED':
    case 'ARCHIVED':
      return '已关闭';
    default:
      return status;
  }
}

export function overviewStatusTone(status: string): OverviewStatCard['tone'] {
  switch (status) {
    case 'PRODUCT_EDITING':
    case 'PRODUCT_REVIEW':
      return 'orange';
    case 'DEVELOPMENT':
      return 'blue';
    case 'TESTING':
      return 'purple';
    case 'BUG_FIXING':
      return 'orange';
    case 'DONE':
      return 'green';
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

export function buildOverviewStats(requirements: Requirement[], bugs: Bug[]): OverviewStatCard[] {
  const openBugs = bugs.filter((b) => b.status.toUpperCase() === 'OPEN').length;
  const bugHandlingReqs = Math.max(
    countByStatus(requirements, ['BUG_FIXING']),
    new Set(
      bugs.filter((b) => b.status.toUpperCase() === 'OPEN').map((b) => b.requirement_id),
    ).size,
  );

  return [
    { key: 'all', label: '全部需求', value: requirements.length, tone: 'neutral' },
    {
      key: 'product',
      label: '产品细化中',
      value: countByStatus(requirements, ['PRODUCT_EDITING', 'PRODUCT_REVIEW']),
      tone: 'orange',
    },
    { key: 'dev', label: '研发中', value: countByStatus(requirements, ['DEVELOPMENT']), tone: 'blue' },
    { key: 'test', label: '测试中', value: countByStatus(requirements, ['TESTING', 'BUG_FIXING']), tone: 'purple' },
    {
      key: 'bug',
      label: 'Bug 处理中',
      value: bugHandlingReqs,
      hint: openBugs ? `${openBugs} 个未关闭 Bug` : undefined,
      tone: 'red',
    },
    {
      key: 'acceptance',
      label: '待产品验收',
      value: countByStatus(requirements, ['DONE']),
      tone: 'orange',
    },
    { key: 'done', label: '已完成', value: countByStatus(requirements, ['CLOSED', 'ARCHIVED']), tone: 'green' },
  ];
}

export function buildPhaseSegments(requirements: Requirement[]): PhaseSegment[] {
  const segments: PhaseSegment[] = [
    {
      key: 'product',
      label: '产品',
      count: countByStatus(requirements, ['PRODUCT_EDITING', 'PRODUCT_REVIEW']),
      color: PHASE_COLORS.product,
    },
    {
      key: 'dev',
      label: '研发',
      count: countByStatus(requirements, ['DEVELOPMENT']),
      color: PHASE_COLORS.dev,
    },
    {
      key: 'test',
      label: '测试',
      count: countByStatus(requirements, ['TESTING', 'BUG_FIXING']),
      color: PHASE_COLORS.test,
    },
    { key: 'pending', label: '待验收', count: countByStatus(requirements, ['DONE']), color: PHASE_COLORS.pending },
    { key: 'done', label: '完成', count: countByStatus(requirements, ['CLOSED', 'ARCHIVED']), color: PHASE_COLORS.done },
    {
      key: 'archived',
      label: '归档',
      count: 0,
      color: PHASE_COLORS.archived,
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
    case 'DEVELOPMENT':
      return pick(req.developer_user_id) ?? pick(req.created_by) ?? pick(req.product_owner_user_id) ?? '—';
    case 'TESTING':
      return pick(req.tester_user_id) ?? pick(req.developer_user_id) ?? '—';
    default:
      return pick(req.created_by) ?? pick(req.product_owner_user_id) ?? pick(req.developer_user_id) ?? '—';
  }
}

export function buildActivityFeed(
  requirements: Requirement[],
  members: ProjectMember[],
): ActivityItem[] {
  const memberMap = new Map(members.map((m) => [m.user_id, m.user_name]));
  const items: ActivityItem[] = [];

  for (const req of requirements.slice(0, 4)) {
    const creator = memberMap.get(req.created_by ?? req.product_owner_user_id ?? 0) ?? '成员';
    if (req.current_status === 'DEVELOPMENT') {
      const dev = memberMap.get(req.developer_user_id ?? 0) ?? creator;
      items.push({
        id: `dev-${req.id}`,
        text: `${dev} 提交了研发完成 · ${req.title}`,
        tone: 'green',
        timeLabel: '1 小时前',
      });
    } else if (req.current_status === 'TESTING') {
      const tester = memberMap.get(req.tester_user_id ?? 0) ?? creator;
      items.push({
        id: `test-${req.id}`,
        text: `${tester} 提交了测试结果 · ${req.title}`,
        tone: 'purple',
        timeLabel: '昨天',
      });
    } else {
      items.push({
        id: `create-${req.id}`,
        text: `${creator} 创建了需求 · ${req.title}`,
        tone: 'blue',
        timeLabel: '10 分钟前',
      });
    }
  }

  return items.slice(0, 4);
}
