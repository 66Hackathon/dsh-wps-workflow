/** 项目成员角色（职能角色在创建需求时指定，不在项目层分配） */

export const UI_MEMBER_ROLES = [
  { code: 'PROJECT_ADMIN', label: '项目管理员' },
  { code: 'MEMBER', label: '成员' },
] as const;

export const CREATOR_UI_ROLES = ['PROJECT_ADMIN'] as const;

/** 添加成员时默认角色 */
export const DEFAULT_MEMBER_ROLE = 'MEMBER';

const UI_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  UI_MEMBER_ROLES.map((r) => [r.code, r.label]),
);

export function uiRoleLabel(code: string): string {
  return UI_ROLE_LABELS[code] ?? code;
}

export function memberRoleCodes(member: { role_codes?: string[]; role_code?: string }, isCreator = false): string[] {
  if (member.role_codes?.length) return [...member.role_codes];
  if (isCreator) return [...CREATOR_UI_ROLES];
  switch (member.role_code) {
    case 'PROJECT_ADMIN':
      return ['PROJECT_ADMIN'];
    case 'MEMBER':
      return ['MEMBER'];
    default:
      return [DEFAULT_MEMBER_ROLE];
  }
}

export function isProjectAdmin(member: { role_codes?: string[]; role_code?: string }): boolean {
  const codes = memberRoleCodes(member);
  return codes.includes('PROJECT_ADMIN') || member.role_code === 'PROJECT_ADMIN';
}

/** 项目成员页展示的简化角色：仅管理员 / 普通成员 */
export function simpleProjectRoleLabel(member: { role_codes?: string[]; role_code?: string }): string {
  return isProjectAdmin(member) ? '管理员' : '普通成员';
}

export function validateMemberRoles(uiRoles: string[], isCreator: boolean): string | null {
  if (isCreator) {
    if (uiRoles.length !== 1 || uiRoles[0] !== 'PROJECT_ADMIN') {
      return '创建者仅保留项目管理员角色';
    }
    return null;
  }
  if (uiRoles.includes('PROJECT_ADMIN')) {
    return '项目管理员角色仅适用于创建者';
  }
  return null;
}

export function userDisplayName(name: string, _nickName?: string): string {
  return name?.trim() || '';
}

export function userAvatarLetter(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0);
}

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6'];

export function userAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function isProjectManager(member: { role_codes?: string[]; role_code?: string }): boolean {
  return isProjectAdmin(member);
}
