import type { Project } from './types';
import { PROJECT_ROLE_LABELS } from './types';

export type ProjectFilter = 'all' | 'active' | 'archived';

const PROJECT_ICONS = ['👥', '🧪', '⟨/⟩', '📦', '🚀', '⚡'] as const;
const PROJECT_ICON_COLORS = ['#dbeafe', '#ffedd5', '#dcfce7', '#f3e8ff', '#fce7f3', '#e0e7ff'] as const;
const PROJECT_ICON_INK = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#db2777', '#4f46e5'] as const;

const PHASE_LABELS = ['研发中', '测试中', '产品完善中'] as const;
const PHASE_STYLES = [
  { bg: '#dbeafe', color: '#2563eb' },
  { bg: '#ffedd5', color: '#ea580c' },
  { bg: '#dcfce7', color: '#16a34a' },
] as const;

export function projectIconIndex(project: Project): number {
  return Math.abs(project.id) % PROJECT_ICONS.length;
}

export function projectIcon(project: Project): string {
  return PROJECT_ICONS[projectIconIndex(project)];
}

export function projectIconStyle(project: Project): { background: string; color: string } {
  const i = projectIconIndex(project);
  return { background: PROJECT_ICON_COLORS[i], color: PROJECT_ICON_INK[i] };
}

export function projectPhaseLabel(project: Project): string {
  return PHASE_LABELS[Math.abs(project.id) % PHASE_LABELS.length];
}

export function projectPhaseStyle(project: Project): { background: string; color: string } {
  const style = PHASE_STYLES[Math.abs(project.id) % PHASE_STYLES.length];
  return { background: style.bg, color: style.color };
}

export function projectStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return '进行中';
    case 'ARCHIVED':
      return '已归档';
    default:
      return status;
  }
}

export function matchesProjectFilter(project: Project, filter: ProjectFilter): boolean {
  const status = project.status.toUpperCase();
  if (filter === 'all') return true;
  if (filter === 'active') return status === 'ACTIVE';
  return status === 'ARCHIVED';
}

export function filterProjects(
  projects: Project[],
  query: string,
  filter: ProjectFilter,
): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter((project) => {
    if (!matchesProjectFilter(project, filter)) return false;
    if (!q) return true;
    return (
      project.name.toLowerCase().includes(q) ||
      project.project_code.toLowerCase().includes(q) ||
      (project.description ?? '').toLowerCase().includes(q)
    );
  });
}

export function memberRoleLabel(project: Project, userId?: number): string {
  if (!userId) return '成员';
  const member = project.members?.find((m) => m.user_id === userId);
  if (!member) return '成员';
  return PROJECT_ROLE_LABELS[member.role_code] ?? member.role_code;
}

export function memberCountLabel(project: Project): string {
  const count = project.members?.length;
  if (count == null) return '—';
  return `${count} 名成员`;
}

const RECENT_KEY = 'tsw_recent_projects';

export interface RecentProjectVisit {
  projectId: number;
  projectName: string;
  snippet: string;
  visitedAt: number;
}

export function loadRecentVisits(): RecentProjectVisit[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProjectVisit[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRecentVisit(project: Project, snippet?: string): void {
  const visits = loadRecentVisits().filter((v) => v.projectId !== project.id);
  visits.unshift({
    projectId: project.id,
    projectName: project.name,
    snippet: snippet ?? project.description?.slice(0, 40) ?? '项目概览',
    visitedAt: Date.now(),
  });
  localStorage.setItem(RECENT_KEY, JSON.stringify(visits.slice(0, 8)));
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function formatRelativeFromISO(iso?: string): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  return formatRelativeTime(ts);
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
