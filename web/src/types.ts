export interface TeamspaceUser {
  id: number;
  wps_user_id: string;
  name: string;
  nick_name?: string;
  avatar_url?: string;
  company_name?: string;
  organization_id: number;
  account_state: string;
}

export interface AuthStatus {
  authenticated: boolean;
  provider: string;
  session_expires_at: string;
  wps_access_expires_at?: string;
  wps_refresh_expires_at?: string;
  auto_renew_enabled: boolean;
}

export interface AuthConfig {
  oauth_configured: boolean;
  dev_mode?: boolean;
  login_path: string;
  redirect_uri?: string;
  frontend_url?: string;
}

export interface LoginInitResponse {
  client_id: string;
  state: string;
  redirect_url: string;
}

export interface Project {
  id: number;
  project_code: string;
  name: string;
  description?: string;
  status: string;
  owner_user_id?: number;
  members?: ProjectMember[];
  git_repo_url?: string;
  git_default_branch?: string;
  wps_group_id?: string;
  wps_group_name?: string;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  requirement_count?: number;
  bug_count?: number;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  user_name: string;
  role_code: string;
  role_codes?: string[];
  joined_at?: string;
}

export interface OrgUser {
  id: number;
  name: string;
  nick_name?: string;
  email?: string;
}

export interface Requirement {
  id: number;
  project_id: number;
  requirement_code: string;
  title: string;
  description?: string;
  priority: string;
  development_scope: string;
  current_status: string;
  status_version: number;
  product_owner_user_id?: number;
  developer_user_id?: number;
  backend_developer_user_id?: number;
  tester_user_id?: number;
  parent_requirement_id?: number;
  frontend_development_completed: boolean;
  backend_development_completed: boolean;
  updated_at?: string;
}

export interface RequirementStageSubmission {
  id: number;
  requirement_id: number;
  stage_code: string;
  spec_body?: string;
  acceptance_criteria?: string;
  product_owner_user_id?: number;
  review_result?: string;
  review_comment?: string;
  reviewer_user_id?: number;
  dev_summary?: string;
  implementation_notes?: string;
  developer_user_id?: number;
  test_summary?: string;
  test_cases_covered?: string;
  test_result?: string;
  tester_user_id?: number;
  release_note?: string;
  closed_by_user_id?: number;
  operator_user_id: number;
  operator_name?: string;
  submitted_at: string;
}

export interface StatusChangeLogEntry {
  id: number;
  from_status?: string;
  to_status: string;
  operator_user_id: number;
  operator_name?: string;
  remark: string;
  created_at: string;
}

export interface RequirementTimeline {
  stage_submissions: RequirementStageSubmission[];
  status_changes: StatusChangeLogEntry[];
}

export interface Bug {
  id: number;
  project_id: number;
  requirement_id: number;
  bug_code: string;
  title: string;
  description: string;
  steps_to_reproduce: string;
  environment: string;
  severity: string;
  status: string;
  found_in_status: string;
  assignee_user_id?: number;
  fix_requirement_id?: number;
}

export interface WorkspaceItem {
  type: 'REQUIREMENT' | 'BUG';
  id: number;
  code: string;
  title: string;
  project_id: number;
  project_name: string;
  role: string;
  status: string;
  priority: string;
  due_at?: string;
  updated_at: string;
  due_soon: boolean;
  overdue: boolean;
}

export interface WorkspaceReminder {
  type: 'REQUIREMENT' | 'BUG';
  title: string;
  project_id: number;
  resource_id: number;
  occurred_at: string;
  unread: boolean;
}

export interface WorkspaceSummary {
  todos: WorkspaceItem[];
  following: WorkspaceItem[];
  reminders: WorkspaceReminder[];
  week: {
    completed_tasks: number;
    closed_bugs: number;
    participated_requirements: number;
  };
}

export interface Conversation {
  id: number;
  project_id: number;
  requirement_id?: number;
  bug_id?: number;
  creator_user_id: number;
  title: string;
  conversation_type: string;
  status: string;
}

export interface ConversationMessage {
  id: number;
  conversation_id: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL' | string;
  content: string;
  status: string;
  model_name?: string;
  created_at?: string;
}

/** 顶层导航（设计文档 §七） */
export type TopNav = 'projects' | 'conversations' | 'workspace' | 'settings';

/** 项目空间子导航 */
export type ProjectTab =
  | 'overview'
  | 'requirements'
  | 'documents'
  | 'members'
  | 'repository'
  | 'group'
  | 'conversations';

export const PROJECT_TAB_LABELS: Record<ProjectTab, string> = {
  overview: '项目概览',
  requirements: '需求',
  documents: '文档',
  members: '成员',
  repository: '代码仓库',
  group: '项目群',
  conversations: '会话',
};

export const TOP_NAV_LABELS: Record<TopNav, string> = {
  projects: '项目空间',
  conversations: '会话',
  workspace: '工作区',
  settings: '设置',
};

export const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  PRODUCT_EDITING: '产品设计中',
  PRODUCT_REVIEW: '待研发分配',
  DEVELOPMENT: '研发中',
  TESTING: '测试中',
  BUG_FIXING: 'Bug修复中',
  DONE: '待验收',
  ARCHIVED: '已归档',
};

export const PROJECT_ROLE_LABELS: Record<string, string> = {
  PROJECT_ADMIN: '项目管理员',
  PRODUCT_OWNER: '产品负责人',
  DEVELOPER: '研发',
  TESTER: '测试',
  MEMBER: '成员',
};
