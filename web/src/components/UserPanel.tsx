import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { userAvatarColor, userAvatarLetter } from '../memberRoles';
import type { OrgUser, TeamspaceUser } from '../types';
import { PROJECT_ROLE_LABELS } from '../types';

export function userDisplayName(
  user: Pick<TeamspaceUser, 'id' | 'name' | 'nick_name'> | null | undefined,
): string {
  const nick = String(user?.nick_name ?? '').trim();
  if (nick) return nick;
  return String(user?.name ?? user?.id ?? '').trim();
}

export function userRoleLabel(user: TeamspaceUser | null | undefined): string {
  if (!user) return '';
  return user.company_name ? user.company_name : 'WPS 用户';
}

export function userInitial(
  user: Pick<TeamspaceUser, 'id' | 'name' | 'nick_name'> | null | undefined,
): string {
  const name = userDisplayName(user);
  return name.slice(0, 1) || '?';
}

function UserAvatar({
  user,
  className,
}: {
  user: TeamspaceUser;
  className: string;
}) {
  const displayName = userDisplayName(user);
  if (user.avatar_url) {
    return (
      <img
        className={className}
        src={user.avatar_url}
        alt={displayName}
        referrerPolicy="no-referrer"
      />
    );
  }
  return <div className={`${className} tsw-profileDialogAvatarFallback`}>{userInitial(user)}</div>;
}

interface UserAuthCardProps {
  authError: string | null;
  loading: boolean;
  loginPending: boolean;
  oauthConfigured: boolean | null;
  devMode?: boolean;
  redirectUri?: string;
  onLogin: () => void;
  onDevLogin?: (userId: number) => void;
}

/** Demo 账号角色说明，正式环境移除 dev 登录入口后一并删除 */
const DEV_USER_ROLE_HINTS: Record<number, string> = {
  1: '项目管理员 · 产品负责人',
  2: '研发成员',
  3: '测试成员',
  4: '普通成员',
  5: '普通成员',
};

function devUserLabel(user: OrgUser): string {
  const nick = user.nick_name?.trim();
  return nick || user.name;
}

function DevUserPicker({
  loginPending,
  onDevLogin,
}: {
  loginPending: boolean;
  onDevLogin: (userId: number) => void;
}) {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    void api.devUsers().then(
      (res) => {
        if (!cancelled) setUsers(res.items ?? []);
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '加载演示账号失败');
        }
      },
    ).finally(() => {
      if (!cancelled) setLoadingUsers(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="tsw-devLoginPicker">
      <p className="tsw-devLoginPickerTitle">演示账号快速登录</p>
      <p className="tsw-muted tsw-devLoginPickerHint">
        临时入口，便于切换角色测试流程；正式落地时需关闭 Dev Mode 并移除此区域。
      </p>
      {loadingUsers ? (
        <p className="tsw-muted tsw-devLoginPickerEmpty">加载演示账号…</p>
      ) : null}
      {loadError ? <p className="tsw-error">{loadError}</p> : null}
      {!loadingUsers && users.length ? (
        <ul className="tsw-devLoginUserList">
          {users.map((user) => {
            const label = devUserLabel(user);
            const hint = DEV_USER_ROLE_HINTS[user.id] ?? '演示用户';
            return (
              <li key={user.id}>
                <button
                  type="button"
                  className="tsw-devLoginUserBtn"
                  disabled={loginPending}
                  onClick={() => onDevLogin(user.id)}
                >
                  <span
                    className="tsw-memberAvatar"
                    style={{ background: userAvatarColor(label) }}
                    aria-hidden="true"
                  >
                    {userAvatarLetter(label)}
                  </span>
                  <span className="tsw-devLoginUserText">
                    <strong>{label}</strong>
                    <span className="tsw-muted">{user.name}{user.email ? ` · ${user.email}` : ''}</span>
                    <span className="tsw-devLoginUserRole">{hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!loadingUsers && !users.length && !loadError ? (
        <p className="tsw-muted tsw-devLoginPickerEmpty">暂无演示账号，请先初始化数据库种子数据。</p>
      ) : null}
    </div>
  );
}

export function UserAuthCard({
  authError,
  loading,
  loginPending,
  oauthConfigured,
  devMode,
  redirectUri,
  onLogin,
  onDevLogin,
}: UserAuthCardProps) {
  if (loading) {
    return (
      <div className="tsw-card tsw-empty">
        <p>检查中…</p>
      </div>
    );
  }
  return (
    <div className="tsw-card tsw-empty tsw-authCard">
      <div className="tsw-authBrand">
        <span className="tsw-authBrandMark" aria-hidden="true">W</span>
        <div>
          <h3>WPS 协作登录</h3>
          <p className="tsw-authSubtitle">使用 WPS 365 企业账号授权登录 TeamSpace</p>
        </div>
      </div>
      <ul className="tsw-authFeatures">
        <li>OAuth 2.0 授权码模式，WPS Token 存服务端用户表</li>
        <li>access_token 到期前自动续期</li>
        <li>仅支持企业用户（个人账号不在范围内）</li>
      </ul>
      {authError ? <p className="tsw-error">登录失败：{authError}</p> : null}
      {oauthConfigured === false ? (
        <p className="tsw-error">
          WPS OAuth 未配置。请在 <code>server/.env</code> 填入{' '}
          <code>WPS_OAUTH_CLIENT_ID</code>、<code>WPS_OAUTH_CLIENT_SECRET</code>，
          并在 WPS 开放平台注册回调：
          <code>{redirectUri ?? 'http://127.0.0.1:8090/api/auth/callback'}</code>
        </p>
      ) : null}
      <button
        type="button"
        className="tsw-btn tsw-btnPrimary tsw-btnWps"
        disabled={oauthConfigured === false || loginPending}
        onClick={onLogin}
      >
        {loginPending ? '跳转授权中…' : '使用 WPS 登录'}
      </button>
      {devMode && onDevLogin ? (
        <DevUserPicker loginPending={loginPending} onDevLogin={onDevLogin} />
      ) : null}
    </div>
  );
}

interface UserProfileDialogProps {
  user: TeamspaceUser;
  projectRole?: string;
  onClose: () => void;
  onLogout: () => void;
}

function accountStateMeta(state?: string): { summary: string; badge: string; ok: boolean } {
  const normalized = String(state ?? '').trim().toUpperCase();
  if (normalized === 'ACTIVE') {
    return { summary: '账号正常', badge: 'ACTIVE', ok: true };
  }
  if (!normalized) {
    return { summary: '未知', badge: '—', ok: false };
  }
  return { summary: normalized, badge: normalized, ok: false };
}

export function UserProfileDialog({ user, projectRole, onClose, onLogout }: UserProfileDialogProps) {
  const displayName = userDisplayName(user);
  const legalName = String(user.name ?? '').trim();
  const company = user.company_name || 'WPS 用户';
  const accountState = accountStateMeta(user.account_state);

  return (
    <div
      className="tsw-dialogBackdrop tsw-profileDialogBackdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="tsw-profileDialog" role="dialog" aria-modal="true" aria-label="用户信息">
        <header className="tsw-profileDialogHeader">
          <h2 className="tsw-profileDialogHeading">用户信息</h2>
          <button
            type="button"
            className="tsw-profileDialogClose"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="tsw-profileDialogSummary">
          <UserAvatar user={user} className="tsw-profileDialogAvatar" />
          <div className="tsw-profileDialogSummaryMeta">
            <strong className="tsw-profileDialogName">{displayName}</strong>
            <div className="tsw-profileDialogSummaryRow">
              <span className="tsw-profileDialogCompany">{company}</span>
              <span className={`tsw-tag tsw-profileDialogStatusTag${accountState.ok ? ' tsw-tagSuccess' : ' tsw-tagMuted'}`}>
                {accountState.summary}
              </span>
            </div>
            {projectRole ? (
              <span className="tsw-profileDialogProjectRole">
                当前项目角色：{PROJECT_ROLE_LABELS[projectRole] ?? projectRole}
              </span>
            ) : null}
          </div>
        </div>

        <div className="tsw-profileDialogCard">
          <dl className="tsw-profileDialogFields">
            {legalName ? (
              <div className="tsw-profileDialogField">
                <dt>姓名</dt>
                <dd>{legalName}</dd>
              </div>
            ) : null}
            {user.wps_user_id ? (
              <div className="tsw-profileDialogField">
                <dt>WPS 用户 ID</dt>
                <dd>{user.wps_user_id}</dd>
              </div>
            ) : null}
            {user.company_name ? (
              <div className="tsw-profileDialogField">
                <dt>公司</dt>
                <dd>{user.company_name}</dd>
              </div>
            ) : null}
            {user.account_state ? (
              <div className="tsw-profileDialogField">
                <dt>账号状态</dt>
                <dd>
                  <span className={`tsw-tag tsw-profileDialogStatusTag${accountState.ok ? ' tsw-tagSuccess' : ' tsw-tagMuted'}`}>
                    {accountState.badge}
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <footer className="tsw-profileDialogActions">
          <button type="button" className="tsw-profileDialogBtn tsw-profileDialogLogout" onClick={onLogout}>
            退出登录
          </button>
          <button type="button" className="tsw-profileDialogBtn tsw-profileDialogCloseBtn" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}

interface TeamSpaceSidebarUserProps {
  user: TeamspaceUser | null | undefined;
  loading: boolean;
  authError: string | null;
  onOpenProfile: () => void;
  onLogin: () => void;
}

export function TeamSpaceSidebarUser({
  user,
  loading,
  authError,
  onOpenProfile,
  onLogin,
}: TeamSpaceSidebarUserProps) {
  if (loading || user === undefined) {
    return (
      <div className="tsw-shellUser tsw-shellUserLoading">
        <div className="tsw-shellUserAvatar tsw-shellUserAvatarFallback">…</div>
        <div className="tsw-shellUserText">
          <span className="tsw-shellUserName">检查中…</span>
          <span className="tsw-shellUserRole"> </span>
        </div>
        <span className="tsw-shellUserChevron" aria-hidden="true">▾</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        className="tsw-shellUser tsw-shellUserGuest"
        onClick={onLogin}
        title={authError ? `登录失败：${authError}` : '点击登录'}
      >
        <div className="tsw-shellUserAvatar tsw-shellUserAvatarFallback">?</div>
        <div className="tsw-shellUserText">
          <span className="tsw-shellUserName">未登录</span>
          <span className="tsw-shellUserRole">点击登录</span>
        </div>
        <span className="tsw-shellUserChevron" aria-hidden="true">▾</span>
      </button>
    );
  }

  const role = userRoleLabel(user);
  const displayName = userDisplayName(user);

  return (
    <button
      type="button"
      className="tsw-shellUser"
      onClick={onOpenProfile}
      title="个人信息"
    >
      {user.avatar_url ? (
        <img
          className="tsw-shellUserAvatar"
          src={user.avatar_url}
          alt={displayName}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="tsw-shellUserAvatar tsw-shellUserAvatarFallback">
          {userInitial(user)}
        </div>
      )}
      <div className="tsw-shellUserText">
        <span className="tsw-shellUserName">{displayName}</span>
        <span className="tsw-shellUserRole">{role}</span>
      </div>
      <span className="tsw-shellUserChevron" aria-hidden="true">▾</span>
    </button>
  );
}
