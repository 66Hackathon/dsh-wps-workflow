import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { userAvatarColor } from '../memberRoles';
import type { AuthStatus, TeamspaceUser } from '../types';
import { userDisplayName, userInitial } from './UserPanel';

type SettingsTab = 'profile' | 'wps' | 'dsh' | 'remote' | 'logs';

type RemotePermissions = {
  query_projects: boolean;
  query_progress: boolean;
  query_bugs: boolean;
  query_documents: boolean;
  create_requirement: boolean;
  create_bug: boolean;
  add_comment: boolean;
  associate_materials: boolean;
  status_transition: boolean;
  assign_owner: boolean;
  product_acceptance: boolean;
  bug_regression_confirm: boolean;
  ai_generate_docs: boolean;
  ai_analyze_bug: boolean;
  ai_query_repo: boolean;
};

type RemoteSecurityRules = {
  high_risk_secondary_confirm: boolean;
  project_members_only: boolean;
  private_chat_select_project: boolean;
  group_chat_inherit_project: boolean;
};

const SETTINGS_TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: 'profile', label: '个人信息', icon: '👤' },
  { key: 'wps', label: 'WPS 接入', icon: '🔗' },
  { key: 'dsh', label: 'DSH 服务', icon: '☁' },
  { key: 'remote', label: '远程权限', icon: '🛡' },
  { key: 'logs', label: '操作记录', icon: '📋' },
];

type WPSMessageRange = {
  group_messages: boolean;
  private_messages: boolean;
  mention_reply: boolean;
  common_group_messages: boolean;
};

const DEFAULT_WPS_MESSAGE_RANGE: WPSMessageRange = {
  group_messages: true,
  private_messages: true,
  mention_reply: true,
  common_group_messages: false,
};

const WPS_CALLBACK_EVENTS = [
  { key: 'message', label: '消息事件', hint: '发送/撤回消息通知' },
  { key: 'member', label: '成员变更', hint: '成员加入/退出群聊通知' },
  { key: 'group_bind', label: '群绑定', hint: '群绑定/解绑通知' },
] as const;

const MOCK_DSH_CONFIG = {
  enabled: false,
  service_url: 'http://127.0.0.1:3090',
  access_token_set: false,
  timeout_sec: 60,
  max_concurrency: 10,
  default_agent: 'teamspace',
  runtime: {
    status: 'stub',
    active_conversations: 0,
    calls_today: 0,
    avg_response_sec: 0,
  },
};

const PERMISSION_GROUPS: {
  title: string;
  items: { key: keyof RemotePermissions; label: string }[];
}[] = [
  {
    title: '查询能力',
    items: [
      { key: 'query_projects', label: '查询项目' },
      { key: 'query_progress', label: '查询进度' },
      { key: 'query_bugs', label: '查询 Bug' },
      { key: 'query_documents', label: '查询文档' },
    ],
  },
  {
    title: '写入能力',
    items: [
      { key: 'create_requirement', label: '创建需求' },
      { key: 'create_bug', label: '创建 Bug' },
      { key: 'add_comment', label: '添加评论' },
      { key: 'associate_materials', label: '关联资料' },
    ],
  },
  {
    title: '流程操作',
    items: [
      { key: 'status_transition', label: '状态流转' },
      { key: 'assign_owner', label: '分配负责人' },
      { key: 'product_acceptance', label: '产品验收' },
      { key: 'bug_regression_confirm', label: 'Bug 回归确认' },
    ],
  },
  {
    title: 'AI 能力',
    items: [
      { key: 'ai_generate_docs', label: 'AI 生成文档' },
      { key: 'ai_analyze_bug', label: 'AI 分析 Bug' },
      { key: 'ai_query_repo', label: 'AI 查询代码仓库' },
    ],
  },
];

const SECURITY_RULE_ITEMS: { key: keyof RemoteSecurityRules; label: string }[] = [
  { key: 'high_risk_secondary_confirm', label: '高风险操作需二次确认' },
  { key: 'project_members_only', label: '仅项目成员可执行' },
  { key: 'private_chat_select_project', label: '私聊需先选择项目' },
  { key: 'group_chat_inherit_project', label: '群聊继承绑定项目' },
];

const DEFAULT_REMOTE_PERMISSIONS: RemotePermissions = {
  query_projects: true,
  query_progress: true,
  query_bugs: true,
  query_documents: true,
  create_requirement: true,
  create_bug: true,
  add_comment: false,
  associate_materials: false,
  status_transition: false,
  assign_owner: false,
  product_acceptance: false,
  bug_regression_confirm: false,
  ai_generate_docs: true,
  ai_analyze_bug: true,
  ai_query_repo: false,
};

const DEFAULT_SECURITY_RULES: RemoteSecurityRules = {
  high_risk_secondary_confirm: true,
  project_members_only: true,
  private_chat_select_project: true,
  group_chat_inherit_project: true,
};

type MockOperationRecord = {
  id: number;
  time: string;
  source: string;
  user: string;
  project: string;
  summary: string;
  capability: string;
  result: 'success' | 'pending' | 'failed';
};

const MOCK_OPERATION_RECORDS: MockOperationRecord[] = [
  {
    id: 1,
    time: '今天 10:28',
    source: 'WPS 私聊',
    user: '张三',
    project: 'DevTools',
    summary: '查询 REQ-102 当前进度',
    capability: 'get_requirement',
    result: 'success',
  },
  {
    id: 2,
    time: '今天 09:52',
    source: 'DevTools 项目群',
    user: '李明',
    project: 'DevTools',
    summary: '创建登录异常 Bug',
    capability: 'create_bug',
    result: 'pending',
  },
  {
    id: 3,
    time: '昨天 18:06',
    source: 'WPS 私聊',
    user: '王芳',
    project: 'WPS Office',
    summary: '列出项目未关闭 Bug',
    capability: 'list_bugs',
    result: 'success',
  },
  {
    id: 4,
    time: '昨天 16:41',
    source: 'DevTools 项目群',
    user: '赵强',
    project: 'DevTools',
    summary: '推进需求到测试阶段',
    capability: 'transition_requirement',
    result: 'failed',
  },
];

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function accountStateLabel(state: string): { text: string; tone: 'success' | 'muted' } {
  if (state.toUpperCase() === 'ACTIVE') return { text: '正常', tone: 'success' };
  return { text: state || '未知', tone: 'muted' };
}

function NotIntegratedBanner({ note }: { note: string }) {
  return (
    <div className="tsw-settingsIntegrationBanner" data-tone="warn">
      <strong>未真实接入</strong>
      <span>{note}</span>
    </div>
  );
}

function ProfileSection({ user }: { user: TeamspaceUser }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.authStatus().then(
      (response) => {
        if (!cancelled) setAuthStatus(response);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载登录状态失败');
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user.id]);

  const displayName = userDisplayName(user);
  const account = accountStateLabel(user.account_state);

  return (
    <section className="tsw-settingsSection">
      <header className="tsw-settingsSectionHeader">
        <div>
          <h2>个人信息</h2>
          <p className="tsw-muted">展示当前登录用户资料与会话状态（来自 /api/auth/me 与 /api/auth/status）。</p>
        </div>
      </header>

      {loading ? <p className="tsw-muted">加载中…</p> : null}
      {error ? <p className="tsw-error">{error}</p> : null}

      <div className="tsw-settingsProfileLayout">
        <article className="tsw-card tsw-settingsProfileCard">
          <div className="tsw-settingsProfileHero">
            {user.avatar_url ? (
              <img className="tsw-settingsProfileAvatar" src={user.avatar_url} alt={displayName} />
            ) : (
              <div
                className="tsw-settingsProfileAvatar tsw-settingsProfileAvatarFallback"
                style={{ background: userAvatarColor(displayName) }}
              >
                {userInitial(user)}
              </div>
            )}
            <div>
              <h3>{displayName}</h3>
              <p className="tsw-muted">{user.company_name || 'WPS 用户'}</p>
              <span className={`tsw-tag ${account.tone === 'success' ? 'tsw-tagSuccess' : 'tsw-tagMuted'}`}>
                账号{account.text}
              </span>
            </div>
          </div>
          <dl className="tsw-settingsFieldGrid">
            <div><dt>姓名</dt><dd>{user.name || '—'}</dd></div>
            <div><dt>昵称</dt><dd>{user.nick_name || '—'}</dd></div>
            <div><dt>企业</dt><dd>{user.company_name || '—'}</dd></div>
            <div><dt>WPS 用户 ID</dt><dd>{user.wps_user_id || '—'}</dd></div>
            <div><dt>用户 ID</dt><dd>{user.id}</dd></div>
          </dl>
        </article>

        <article className="tsw-card tsw-settingsProfileCard">
          <h3>登录与安全</h3>
          <dl className="tsw-settingsFieldGrid">
            <div><dt>认证方式</dt><dd>WPS OAuth / 系统会话</dd></div>
            <div><dt>会话到期</dt><dd>{formatDateTime(authStatus?.session_expires_at)}</dd></div>
            <div><dt>Token 自动续期</dt><dd>{authStatus?.auto_renew_enabled ? '已开启' : '未开启'}</dd></div>
            <div><dt>WPS Token 到期</dt><dd>{formatDateTime(authStatus?.wps_access_expires_at)}</dd></div>
          </dl>
        </article>
      </div>
    </section>
  );
}

function WPSSection() {
  const [appId, setAppId] = useState('wps-app-8f21c6');
  const [appKey, setAppKey] = useState('••••••••••••••••');
  const [messageRange, setMessageRange] = useState<WPSMessageRange>(DEFAULT_WPS_MESSAGE_RANGE);

  const toggleRange = (key: keyof WPSMessageRange) => {
    setMessageRange((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <section className="tsw-settingsSection">
      <header className="tsw-settingsSectionHeader">
        <div>
          <h2>WPS 接入</h2>
          <p className="tsw-muted">配置 WPS 协作应用，接收群聊与私聊消息。</p>
        </div>
        <NotIntegratedBanner note="当前为前端演示页，WPS 协作回调与消息接入尚未真实接入，配置不会保存到后端。" />
      </header>

      <article className="tsw-card tsw-settingsWpsStatusCard">
        <div className="tsw-settingsWpsStatusRow">
          <div>
            <strong>WPS 协作</strong>
            <span className="tsw-tag tsw-tagSuccess">已连接（演示）</span>
          </div>
          <span className="tsw-muted">上次检测：今天 10:32</span>
        </div>
        <button type="button" className="tsw-btn" disabled title="未真实接入">
          重新检测
        </button>
      </article>

      <div className="tsw-settingsWpsLayout">
        <article className="tsw-card tsw-settingsWpsCard">
          <h3>WPS 应用配置</h3>
          <p className="tsw-settingsInfoBanner">
            应用凭证仅管理员可见；当前页面不展示回调地址、消息校验 Token 与消息加密密钥。
          </p>
          <div className="tsw-settingsFormGrid">
            <label className="tsw-fieldLabel">
              AppID
              <input
                className="tsw-input"
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
              />
            </label>
            <label className="tsw-fieldLabel">
              AppKey
              <div className="tsw-settingsInlineField">
                <input
                  className="tsw-input"
                  type="password"
                  value={appKey}
                  onChange={(event) => setAppKey(event.target.value)}
                />
                <button type="button" className="tsw-btn" disabled title="未真实接入">
                  重新填写
                </button>
              </div>
            </label>
          </div>
          <div className="tsw-settingsRemoteActions">
            <button type="button" className="tsw-btn" disabled title="未真实接入">
              测试连接
            </button>
            <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" disabled title="未真实接入">
              保存配置
            </button>
          </div>
          <p className="tsw-muted tsw-settingsHint">上次连接测试成功：今天 10:32（演示数据）</p>
        </article>

        <aside className="tsw-card tsw-settingsWpsAside">
          <h3>消息接收范围</h3>
          <ul className="tsw-settingsToggleList">
            <li>
              <div>
                <strong>群聊消息</strong>
                <span className="tsw-muted">接收群聊中的消息</span>
              </div>
              <label className="tsw-settingsSwitch">
                <input
                  type="checkbox"
                  checked={messageRange.group_messages}
                  onChange={() => toggleRange('group_messages')}
                />
                <span aria-hidden="true" />
              </label>
            </li>
            <li>
              <div>
                <strong>私聊消息</strong>
                <span className="tsw-muted">接收与机器人的私聊</span>
              </div>
              <label className="tsw-settingsSwitch">
                <input
                  type="checkbox"
                  checked={messageRange.private_messages}
                  onChange={() => toggleRange('private_messages')}
                />
                <span aria-hidden="true" />
              </label>
            </li>
            <li>
              <div>
                <strong>@ 时响应</strong>
                <span className="tsw-muted">群聊中被 @ 时响应</span>
              </div>
              <label className="tsw-settingsSwitch">
                <input
                  type="checkbox"
                  checked={messageRange.mention_reply}
                  onChange={() => toggleRange('mention_reply')}
                />
                <span aria-hidden="true" />
              </label>
            </li>
            <li>
              <div>
                <strong>普通群消息</strong>
                <span className="tsw-muted">接收未 @ 机器人的群消息</span>
              </div>
              <label className="tsw-settingsSwitch">
                <input
                  type="checkbox"
                  checked={messageRange.common_group_messages}
                  onChange={() => toggleRange('common_group_messages')}
                />
                <span aria-hidden="true" />
              </label>
            </li>
          </ul>
        </aside>
      </div>

      <section className="tsw-settingsWpsEvents">
        <h3>回调事件（演示）</h3>
        <div className="tsw-settingsWpsEventGrid">
          {WPS_CALLBACK_EVENTS.map((item) => (
            <article key={item.key} className="tsw-card tsw-settingsWpsEventCard">
              <span className="tsw-tag tsw-tagSuccess">已启用</span>
              <strong>{item.label}</strong>
              <p className="tsw-muted">{item.hint}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function DSHSection() {
  const data = MOCK_DSH_CONFIG;

  return (
    <section className="tsw-settingsSection">
      <header className="tsw-settingsSectionHeader">
        <div>
          <h2>DSH 服务</h2>
          <p className="tsw-muted">配置 AI Agent 服务与调用参数。</p>
        </div>
        <NotIntegratedBanner note="当前为前端演示页，DSH SDK 尚未完整接入，配置不会保存到后端。" />
      </header>

      <div className="tsw-settingsDshLayout">
        <article className="tsw-card tsw-settingsDshCard">
          <div className="tsw-settingsStatusRow">
            <span className={`tsw-tag ${data.enabled ? 'tsw-tagSuccess' : 'tsw-tagMuted'}`}>
              {data.enabled ? '服务已启用' : '服务未启用'}
            </span>
            <span className="tsw-muted">运行状态：{data.runtime.status}</span>
          </div>
          <dl className="tsw-settingsFieldGrid">
            <div><dt>服务地址</dt><dd>{data.service_url}</dd></div>
            <div><dt>Access Token</dt><dd>{data.access_token_set ? '已配置（演示）' : '未配置'}</dd></div>
            <div><dt>请求超时</dt><dd>{data.timeout_sec} 秒</dd></div>
            <div><dt>最大并发</dt><dd>{data.max_concurrency}</dd></div>
            <div><dt>默认 Agent</dt><dd>{data.default_agent}</dd></div>
          </dl>
        </article>

        <aside className="tsw-card tsw-settingsDshAside">
          <h3>运行状态（演示）</h3>
          <div className="tsw-settingsStatGrid">
            <article><span>活跃会话</span><strong>{data.runtime.active_conversations}</strong></article>
            <article><span>今日调用</span><strong>{data.runtime.calls_today}</strong></article>
            <article><span>平均响应</span><strong>{data.runtime.avg_response_sec}s</strong></article>
          </div>
          <button type="button" className="tsw-btn" disabled title="未真实接入">
            测试连接
          </button>
        </aside>
      </div>
    </section>
  );
}

function RemotePermissionsSection() {
  const [permissions, setPermissions] = useState<RemotePermissions>(DEFAULT_REMOTE_PERMISSIONS);
  const [securityRules, setSecurityRules] = useState<RemoteSecurityRules>(DEFAULT_SECURITY_RULES);

  const togglePermission = (key: keyof RemotePermissions) => {
    setPermissions((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleRule = (key: keyof RemoteSecurityRules) => {
    setSecurityRules((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <section className="tsw-settingsSection">
      <header className="tsw-settingsSectionHeader">
        <div>
          <h2>远程权限</h2>
          <p className="tsw-muted">控制 WPS / DSH 远程调用 TeamSpace 时可执行的能力。</p>
        </div>
        <NotIntegratedBanner note="当前为前端演示页，开关仅在本页生效，不会写入后端或影响真实权限校验。" />
      </header>

      <div className="tsw-settingsRemoteLayout">
        <div className="tsw-settingsRemoteMain">
          {PERMISSION_GROUPS.map((group) => (
            <article key={group.title} className="tsw-card tsw-settingsRemoteGroup">
              <h3>{group.title}</h3>
              <ul className="tsw-settingsToggleList">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <strong>{item.label}</strong>
                    <label className="tsw-settingsSwitch">
                      <input
                        type="checkbox"
                        checked={permissions[item.key]}
                        onChange={() => togglePermission(item.key)}
                      />
                      <span aria-hidden="true" />
                    </label>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <aside className="tsw-card tsw-settingsRemoteAside">
          <h3>安全规则</h3>
          <ul className="tsw-settingsCheckList">
            {SECURITY_RULE_ITEMS.map((item) => (
              <li key={item.key}>
                <label className="tsw-settingsCheckItem">
                  <input
                    type="checkbox"
                    checked={securityRules[item.key]}
                    onChange={() => toggleRule(item.key)}
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="tsw-settingsRemoteActions">
            <button
              type="button"
              className="tsw-btn"
              onClick={() => {
                setPermissions(DEFAULT_REMOTE_PERMISSIONS);
                setSecurityRules(DEFAULT_SECURITY_RULES);
              }}
            >
              恢复默认
            </button>
            <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" disabled title="未真实接入">
              保存权限
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function OperationLogsSection() {
  const stats = useMemo(() => ({
    total: MOCK_OPERATION_RECORDS.length,
    success: MOCK_OPERATION_RECORDS.filter((item) => item.result === 'success').length,
    pending: MOCK_OPERATION_RECORDS.filter((item) => item.result === 'pending').length,
    failed: MOCK_OPERATION_RECORDS.filter((item) => item.result === 'failed').length,
  }), []);

  const resultLabel = (result: MockOperationRecord['result']) => {
    switch (result) {
      case 'success': return '成功';
      case 'pending': return '待确认';
      default: return '失败';
    }
  };

  return (
    <section className="tsw-settingsSection">
      <header className="tsw-settingsSectionHeader">
        <div>
          <h2>操作记录</h2>
          <p className="tsw-muted">查看远程调用与关键操作的审计日志。</p>
        </div>
        <NotIntegratedBanner note="当前为前端 Mock 数据，尚未接入后端审计日志与导出能力。" />
      </header>

      <div className="tsw-settingsLogStats">
        <article><span>总调用</span><strong>{stats.total}</strong></article>
        <article data-tone="success"><span>成功</span><strong>{stats.success}</strong></article>
        <article data-tone="warn"><span>待确认</span><strong>{stats.pending}</strong></article>
        <article data-tone="danger"><span>失败</span><strong>{stats.failed}</strong></article>
      </div>

      <div className="tsw-card tsw-settingsLogTableWrap">
        <table className="tsw-settingsLogTable">
          <thead>
            <tr>
              <th>时间</th>
              <th>来源</th>
              <th>操作用户</th>
              <th>关联项目</th>
              <th>请求摘要</th>
              <th>调用能力</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_OPERATION_RECORDS.map((item) => (
              <tr key={item.id}>
                <td>{item.time}</td>
                <td>{item.source}</td>
                <td>{item.user}</td>
                <td>{item.project}</td>
                <td>{item.summary}</td>
                <td><code>{item.capability}</code></td>
                <td><span className="tsw-settingsLogResult" data-result={item.result}>{resultLabel(item.result)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface Props {
  user: TeamspaceUser;
}

export function SettingsPanel({ user }: Props) {
  const [tab, setTab] = useState<SettingsTab>('profile');

  return (
    <div className="tsw-settingsPage">
      <div className="tsw-settingsPageIntro">
        <h2>设置</h2>
        <p className="tsw-muted">管理系统接入与远程操作能力</p>
      </div>

      <div className="tsw-settingsLayout">
        <nav className="tsw-settingsNav" aria-label="系统设置">
          {SETTINGS_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="tsw-settingsNavItem"
              data-active={tab === item.key ? 'true' : 'false'}
              onClick={() => setTab(item.key)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="tsw-settingsContent">
          {tab === 'profile' ? <ProfileSection user={user} /> : null}
          {tab === 'wps' ? <WPSSection /> : null}
          {tab === 'dsh' ? <DSHSection /> : null}
          {tab === 'remote' ? <RemotePermissionsSection /> : null}
          {tab === 'logs' ? <OperationLogsSection /> : null}
        </div>
      </div>
    </div>
  );
}
