import { useCallback, useEffect, useState } from 'react';
import { api, setStoredToken } from '../api/client';
import type { Project, TeamspaceUser, TopNav } from '../types';
import { TOP_NAV_LABELS } from '../types';
import { loadRecentVisits, recordRecentVisit, type RecentProjectVisit } from '../projectDisplay';
import { FeatureLockedDialog } from './FeatureLockedDialog';
import { PersonalWorkspace } from './PersonalWorkspace';
import { ProjectFlowView } from './ProjectFlowView';
import { ProjectWorkspace } from './ProjectWorkspace';
import {
  TeamSpaceSidebarUser,
  UserAuthCard,
  UserProfileDialog,
} from './UserPanel';
import { SettingsPanel } from './SettingsPanel';

const TOP_NAV: { key: TopNav; label: string; icon: string }[] = [
  { key: 'projects', label: '项目空间', icon: '▦' },
  { key: 'workspace', label: '工作区', icon: '◫' },
  { key: 'settings', label: '设置', icon: '⚙' },
];

function consumeTokenFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) return false;
  setStoredToken(token);
  params.delete('token');
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', next);
  return true;
}

function readAuthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('auth_error');
  if (!error) return null;
  params.delete('auth_error');
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', next);
  return error;
}

export default function TeamSpaceApp() {
  const [topNav, setTopNav] = useState<TopNav>('projects');
  const [user, setUser] = useState<TeamspaceUser | null | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(() => readAuthErrorFromUrl());
  const [loading, setLoading] = useState(true);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [workspaceEntry, setWorkspaceEntry] = useState<'requirements' | 'settings'>('requirements');
  const [profileOpen, setProfileOpen] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string | undefined>();
  const [loginPending, setLoginPending] = useState(false);
  const [recentVisits, setRecentVisits] = useState<RecentProjectVisit[]>(() => loadRecentVisits());

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.me();
      setUser(me);
      setAuthError(null);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBackend = useCallback(async () => {
    try {
      await api.health();
      setBackendOk(true);
    } catch {
      setBackendOk(false);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const list = await api.listProjects();
      setProjects(list.items ?? []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    consumeTokenFromUrl();
    void refreshBackend();
    void refreshAuth();
    void api.authConfig().then(
      (cfg) => {
        setOauthConfigured(cfg.oauth_configured);
        setDevMode(Boolean(cfg.dev_mode));
        setRedirectUri(cfg.redirect_uri);
      },
      () => setOauthConfigured(null),
    );
  }, [refreshAuth, refreshBackend]);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setSelectedProject(null);
      return;
    }
    void refreshProjects();
  }, [user, refreshProjects]);

  useEffect(() => {
    if (!user) return undefined;
    const keepAlive = window.setInterval(() => {
      void api.authStatus().catch(() => {
        void refreshAuth();
      });
    }, 5 * 60 * 1000);
    return () => window.clearInterval(keepAlive);
  }, [user, refreshAuth]);

  const handleDevLogin = async (userId: number) => {
    setLoginPending(true);
    setAuthError(null);
    try {
      const res = await api.devLogin(userId);
      setStoredToken(res.token);
      const me = await api.me();
      setUser(me);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '演示登录失败');
    } finally {
      setLoginPending(false);
    }
  };

  const handleLogin = async () => {
    setLoginPending(true);
    setAuthError(null);
    try {
      const init = await api.authLogin();
      window.location.assign(init.redirect_url);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '发起登录失败');
      setLoginPending(false);
    }
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    try {
      await api.logout();
    } finally {
      setStoredToken(null);
      setUser(null);
      setProjects([]);
      setSelectedProject(null);
    }
  };

  const openProject = async (
    projectId: number,
    entry: 'requirements' | 'settings' = 'requirements',
  ) => {
    setWorkspaceEntry(entry);
    try {
      const detail = await api.getProject(projectId);
      setSelectedProject(detail);
      recordRecentVisit(detail);
      setRecentVisits(loadRecentVisits());
    } catch {
      const fallback = projects.find((p) => p.id === projectId) ?? null;
      if (fallback) {
        recordRecentVisit(fallback);
        setRecentVisits(loadRecentVisits());
      }
      setSelectedProject(fallback);
    }
  };

  const projectRole = selectedProject?.members?.find((m) => m.user_id === user?.id)?.role_code;

  const backendLabel =
    backendOk === null ? '检查中…' : backendOk ? '已连接' : '未连接';

  const mainContent = (() => {
    if (!user && !loading) {
      return (
        <UserAuthCard
          authError={authError}
          loading={loading}
          loginPending={loginPending}
          oauthConfigured={oauthConfigured}
          devMode={devMode}
          redirectUri={redirectUri}
          onLogin={() => void handleLogin()}
          onDevLogin={(userId) => void handleDevLogin(userId)}
        />
      );
    }

    if (topNav === 'projects' && user) {
      if (selectedProject) {
        return (
          <ProjectWorkspace
            project={selectedProject}
            projectRole={projectRole}
            currentUserId={user.id}
            initialEntry={workspaceEntry}
            onBack={() => {
              setSelectedProject(null);
              setWorkspaceEntry('requirements');
            }}
            onProjectUpdated={(updated) => {
              setSelectedProject(updated);
              void refreshProjects();
            }}
            onProjectDeleted={() => {
              setSelectedProject(null);
              setWorkspaceEntry('requirements');
              void refreshProjects();
            }}
          />
        );
      }
      return (
        <ProjectFlowView
          projects={projects}
          loading={loading}
          currentUserId={user.id}
          recentVisits={recentVisits}
          onSelectProject={(id) => void openProject(id, 'requirements')}
          onOpenProjectSettings={(id) => void openProject(id, 'settings')}
          onProjectCreated={() => void refreshProjects()}
        />
      );
    }

    if (topNav === 'workspace' && user) {
      return (
        <PersonalWorkspace
          onOpenProject={(projectId) => {
            setTopNav('projects');
            void openProject(projectId, 'requirements');
          }}
        />
      );
    }

    if (topNav === 'settings' && user) {
      return <SettingsPanel user={user} />;
    }

    return null;
  })();

  return (
    <>
      <div className="tsw-root tsw-app">
        <div className="tsw-shellLayout">
          <aside className="tsw-shellSidebar" aria-label="TeamSpace">
            <div className="tsw-shellBrand">
              <span className="tsw-shellBrandMark" aria-hidden="true">⬡</span>
              <span className="tsw-shellBrandText">DSH TeamSpace</span>
            </div>
            <nav className="tsw-shellNav">
              {TOP_NAV.map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  className="tsw-shellNavItem"
                  data-active={topNav === key ? 'true' : 'false'}
                  onClick={() => {
                    setTopNav(key);
                    if (key !== 'projects') setSelectedProject(null);
                  }}
                >
                  <span className="tsw-shellNavIcon" aria-hidden="true">{icon}</span>
                  <span className="tsw-shellNavLabel">{label}</span>
                </button>
              ))}
            </nav>
            <div className="tsw-shellNavSpacer" />
            <TeamSpaceSidebarUser
              user={user}
              loading={loading}
              authError={authError}
              onOpenProfile={() => setProfileOpen(true)}
              onLogin={() => void handleLogin()}
            />
          </aside>
          <div className="tsw-shellMain">
            <header className="tsw-header">
              <div className="tsw-titleWrap">
                <h1 className="tsw-title">TeamSpace</h1>
                <p className="tsw-eyebrow">{TOP_NAV_LABELS[topNav]}</p>
              </div>
              <div className="tsw-headerActions">
                <span
                  className="tsw-badge"
                  data-ok={backendOk === null ? undefined : String(backendOk)}
                >
                  服务状态：{backendLabel}
                </span>
              </div>
            </header>
            <main className="tsw-main">{mainContent}</main>
          </div>
        </div>
      </div>
      {profileOpen && user ? (
        <UserProfileDialog
          user={user}
          projectRole={projectRole}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
        />
      ) : null}
      {lockedFeature ? (
        <FeatureLockedDialog
          label={lockedFeature}
          onClose={() => setLockedFeature(null)}
        />
      ) : null}
    </>
  );
}
