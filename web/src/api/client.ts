import type {
  AuthConfig,
  AuthStatus,
  Bug,
  Conversation,
  ConversationMessage,
  LoginInitResponse,
  OrgUser,
  Project,
  ProjectMember,
  Requirement,
  RequirementTimeline,
  TeamspaceUser,
  WorkspaceSummary,
} from '../types';

const TOKEN_KEY = 'teamspace_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: string }).message)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  health: () => request<{ status: string }>('/healthz'),
  authConfig: () => request<AuthConfig>('/api/auth/config'),
  authLogin: () => request<LoginInitResponse>('/api/auth/login'),
  me: () => request<TeamspaceUser>('/api/auth/me'),
  authStatus: () => request<AuthStatus>('/api/auth/status'),
  logout: () => request<{ status: string }>('/api/auth/logout', { method: 'POST' }),
  devLogin: (userId = 1) =>
    request<{ token: string; user: TeamspaceUser }>('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
  devUsers: () => request<{ items: OrgUser[] }>('/api/auth/dev-users'),
  workspaceSummary: () => request<WorkspaceSummary>('/api/workspace'),

  listProjects: () => request<{ items: Project[] }>('/api/projects'),
  getProject: (id: number) => request<Project>(`/api/projects/${id}`),
  createProject: (payload: { project_code: string; name: string; description?: string }) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
  listProjectMembers: (projectId: number) =>
    request<{ items: ProjectMember[] }>(`/api/projects/${projectId}/members`),
  addProjectMember: (projectId: number, payload: { user_id: number; role_codes: string[] }) =>
    request<ProjectMember>(`/api/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProjectMember: (projectId: number, memberId: number, roleCodes: string[]) =>
    request<ProjectMember>(`/api/projects/${projectId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role_codes: roleCodes }),
    }),
  removeProjectMember: (projectId: number, memberId: number) =>
    request<{ status: string }>(`/api/projects/${projectId}/members/${memberId}`, {
      method: 'DELETE',
    }),
  listOrgUsers: () => request<{ items: OrgUser[] }>('/api/users'),
  updateProjectSetup: (
    projectId: number,
    payload: {
      name?: string;
      description?: string;
      git_repo_url?: string;
      git_default_branch?: string;
      wps_group_id?: string;
      wps_group_name?: string;
    },
  ) =>
    request<Project>(`/api/projects/${projectId}/setup`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteProject: (projectId: number) =>
    request<{ status: string }>(`/api/projects/${projectId}`, { method: 'DELETE' }),

  listRequirements: (projectId: number) =>
    request<{ items: Requirement[] }>(`/api/projects/${projectId}/requirements`),
  getRequirement: (id: number) => request<Requirement>(`/api/requirements/${id}`),
  getRequirementTimeline: (id: number) =>
    request<RequirementTimeline>(`/api/requirements/${id}/timeline`),
  createRequirement: (
    projectId: number,
    payload: {
      requirement_code: string;
      title: string;
      description?: string;
      priority?: string;
      requirement_type?: string;
      acceptance_criteria?: string;
      product_owner_user_id?: number;
      planned_start_at?: string;
      planned_end_at?: string;
    },
  ) =>
    request<Requirement>(`/api/projects/${projectId}/requirements`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  transitionRequirement: (
    id: number,
    toStatus: string,
    stageSubmission?: {
      spec_body?: string;
      acceptance_criteria?: string;
      product_owner_user_id?: number;
      review_result?: string;
      review_comment?: string;
      reviewer_user_id?: number;
      dev_summary?: string;
      implementation_notes?: string;
      developer_user_id?: number;
      backend_developer_user_id?: number;
      test_summary?: string;
      test_cases_covered?: string;
      test_result?: string;
      tester_user_id?: number;
      release_note?: string;
      closed_by_user_id?: number;
      remark?: string;
    },
  ) =>
    request<Requirement>(`/api/requirements/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({
        to_status: toStatus,
        stage_submission: stageSubmission ?? {},
      }),
    }),
  completeDevelopment: (
    id: number,
    payload: { dev_summary: string; implementation_notes: string },
  ) =>
    request<{
      requirement: Requirement;
      frontend_completed: boolean;
      backend_completed: boolean;
      transitioned: boolean;
    }>(`/api/requirements/${id}/development/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listBugs: (projectId: number) => request<{ items: Bug[] }>(`/api/projects/${projectId}/bugs`),
  listRequirementBugs: (requirementId: number) =>
    request<{ items: Bug[] }>(`/api/requirements/${requirementId}/bugs`),
  listChildRequirements: (requirementId: number) =>
    request<{ items: Requirement[] }>(`/api/requirements/${requirementId}/children`),
  createBug: (
    projectId: number,
    payload: {
      requirement_id: number;
      title: string;
      description?: string;
      steps_to_reproduce?: string;
      environment?: string;
      severity?: string;
      assignee_user_id?: number;
      secondary_assignee_user_id?: number;
    },
  ) =>
    request<{
      bug: Bug;
      fix_requirement: Requirement;
      main_requirement: Requirement;
    }>(`/api/projects/${projectId}/bugs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  completeBugFix: (
    requirementId: number,
    payload?: { dev_summary?: string; implementation_notes?: string },
  ) =>
    request<{ requirement: Requirement; bug: Bug }>(
      `/api/requirements/${requirementId}/bug-fix/complete`,
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      },
    ),
  resumeTestingFromBugFix: (requirementId: number, remark?: string) =>
    request<Requirement>(`/api/requirements/${requirementId}/bug-fix/resume-testing`, {
      method: 'POST',
      body: JSON.stringify({ remark: remark ?? '' }),
    }),
  submitBugRetest: (
    bugId: number,
    result: 'PASS' | 'FAIL',
    remark?: string,
  ) =>
    request<{
      bug: Bug;
      fix_requirement: Requirement;
      main_requirement: Requirement;
    }>(`/api/bugs/${bugId}/retest`, {
      method: 'POST',
      body: JSON.stringify({ result, remark: remark ?? '' }),
    }),

  listConversations: (projectId: number) =>
    request<{ items: Conversation[] }>(`/api/projects/${projectId}/conversations`),
  getConversation: (id: number) => request<Conversation>(`/api/conversations/${id}`),
  createConversation: (
    projectId: number,
    payload: { title: string; conversation_type?: string; requirement_id?: number },
  ) =>
    request<Conversation>(`/api/projects/${projectId}/conversations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listMessages: (conversationId: number) =>
    request<{ items: ConversationMessage[] }>(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, content: string) =>
    request<{ user_message: ConversationMessage; assistant_message: ConversationMessage }>(
      `/api/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) },
    ),
};
