import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { formatRelativeFromISO } from '../projectDisplay';
import {
  REQUIREMENT_STATUS_LABELS,
  type WorkspaceActivity,
  type WorkspaceItem,
  type WorkspaceSummary,
} from '../types';

type TodoFilter = 'all' | 'product' | 'development' | 'testing' | 'bug';

const EMPTY_SUMMARY: WorkspaceSummary = {
  todos: [],
  following: [],
  activities: [],
  reminders: [],
  week: {
    completed_tasks: 0,
    closed_bugs: 0,
    participated_requirements: 0,
  },
};

const FILTERS: { key: TodoFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'product', label: '产品' },
  { key: 'development', label: '研发' },
  { key: 'testing', label: '测试' },
  { key: 'bug', label: 'Bug' },
];

function itemFilter(item: WorkspaceItem): TodoFilter {
  if (item.type === 'BUG') return 'bug';
  if (item.role.includes('产品')) return 'product';
  if (item.role.includes('测试')) return 'testing';
  return 'development';
}

function itemTypeLabel(item: WorkspaceItem): string {
  if (item.type === 'BUG') return 'Bug';
  const filter = itemFilter(item);
  if (filter === 'product') return '需求';
  if (filter === 'testing') return '测试';
  return '研发';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ...REQUIREMENT_STATUS_LABELS,
    OPEN: '待修复',
    IN_PROGRESS: '修复中',
    FIXED: '待复测',
    CLOSED: '已关闭',
  };
  return labels[status] ?? status;
}

function dueLabel(item: WorkspaceItem): string {
  if (!item.due_at) return '未设置';
  if (item.overdue) return '已逾期';
  const date = new Date(item.due_at);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return `明天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function PersonalWorkspace({
  onOpenProject,
}: {
  onOpenProject: (projectId: number) => void;
}) {
  const [summary, setSummary] = useState<WorkspaceSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api.workspaceSummary()
      .then((response) => {
        if (!cancelled) setSummary(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '工作区加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const result: Record<TodoFilter, number> = {
      all: summary.todos.length,
      product: 0,
      development: 0,
      testing: 0,
      bug: 0,
    };
    summary.todos.forEach((item) => {
      result[itemFilter(item)] += 1;
    });
    return result;
  }, [summary.todos]);

  const filtered = useMemo(
    () => summary.todos.filter((item) => filter === 'all' || itemFilter(item) === filter),
    [summary.todos, filter],
  );
  const visibleTodos = showAll ? filtered : filtered.slice(0, 4);
  const activities = summary.activities?.length ? summary.activities : summary.following;
  const processing = summary.todos.filter((item) =>
    ['DEV_DESIGN', 'DEVELOPMENT', 'TESTING', 'REGRESSION', 'PRODUCT_ACCEPTANCE'].includes(item.status)).length;
  const dueSoon = summary.todos.filter((item) => item.due_soon).length;
  const overdue = summary.todos.filter((item) => item.overdue).length;

  return (
    <div className="tsw-personalWorkspace">
      <header className="tsw-workspaceHeading">
        <div>
          <h2>工作区</h2>
          <p className="tsw-muted">聚合与你有关的任务、提醒和关注动态</p>
        </div>
      </header>

      {error ? <p className="tsw-error">{error}</p> : null}

      <div className="tsw-workspaceStats">
        <WorkspaceStat icon="☑" label="待我处理" value={summary.todos.length} tone="blue" />
        <WorkspaceStat icon="↻" label="处理中" value={processing} tone="cyan" />
        <WorkspaceStat icon="◷" label="即将到期" value={dueSoon} tone="orange" />
        <WorkspaceStat icon="!" label="已逾期" value={overdue} tone="red" />
        <WorkspaceStat icon="✓" label="本周完成" value={summary.week.completed_tasks} tone="green" />
      </div>

      {loading ? <div className="tsw-card tsw-workspaceLoading">工作区数据加载中…</div> : null}

      {!loading ? (
        <>
          <div className="tsw-workspaceTopGrid">
            <section className="tsw-card tsw-workspacePanel">
              <h3>待我处理</h3>
              <div className="tsw-workspaceTabs">
                {FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    data-active={filter === item.key ? 'true' : 'false'}
                    onClick={() => {
                      setFilter(item.key);
                      setShowAll(false);
                    }}
                  >
                    {item.label} <span>{counts[item.key]}</span>
                  </button>
                ))}
              </div>

              <WorkspaceItemTable items={visibleTodos} onOpenProject={onOpenProject} showRole />

              {filtered.length > 4 ? (
                <button type="button" className="tsw-workspaceMore" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? '收起' : `查看全部 ${filtered.length} 条`} ›
                </button>
              ) : null}
            </section>

            <section className="tsw-card tsw-workspacePanel">
              <h3>最新提醒 <span className="tsw-workspaceHeadingCount">{summary.reminders.length}</span></h3>
              <div className="tsw-workspaceReminderList">
                {summary.reminders.length ? summary.reminders.map((reminder) => (
                  <button
                    key={`${reminder.type}-${reminder.resource_id}`}
                    type="button"
                    className="tsw-workspaceReminder"
                    onClick={() => onOpenProject(reminder.project_id)}
                  >
                    <span className="tsw-workspaceReminderIcon" data-type={reminder.type}>
                      {reminder.type === 'BUG' ? '♧' : '▤'}
                    </span>
                    <span>{reminder.title}</span>
                    <time>{formatRelativeFromISO(reminder.occurred_at)}</time>
                    {reminder.unread ? <i aria-label="未读" /> : null}
                  </button>
                )) : <WorkspaceEmpty text="暂无最新提醒" />}
              </div>
            </section>
          </div>

          <div className="tsw-workspaceBottomGrid">
            <section className="tsw-card tsw-workspacePanel">
              <h3>我的关注 <span className="tsw-workspaceHeadingCount">{activities.length}</span></h3>
              <p className="tsw-muted tsw-workspacePanelHint">你参与项目中的最新流转动态</p>
              <WorkspaceActivityFeed items={activities.slice(0, 8)} onOpenProject={onOpenProject} />
            </section>

            <section className="tsw-card tsw-workspacePanel">
              <h3>本周工作</h3>
              <div className="tsw-workspaceWeekStats">
                <WeekMetric label="完成任务" value={summary.week.completed_tasks} tone="blue" />
                <WeekMetric label="关闭 Bug" value={summary.week.closed_bugs} tone="red" />
                <WeekMetric label="参与需求" value={summary.week.participated_requirements} tone="purple" />
              </div>
              <div className="tsw-workspaceWeekHint">
                <span>🏆</span>
                <p>
                  本周已推进 <strong>{summary.week.participated_requirements}</strong> 个需求，
                  完成 <strong>{summary.week.completed_tasks}</strong> 项关键流转。
                </p>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function WorkspaceStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <article className="tsw-workspaceStat">
      <span className="tsw-workspaceStatIcon" data-tone={tone}>{icon}</span>
      <div><span>{label}</span><strong>{value}</strong></div>
    </article>
  );
}

function WorkspaceItemTable({
  items,
  onOpenProject,
  showRole = false,
}: {
  items: WorkspaceItem[];
  onOpenProject: (projectId: number) => void;
  showRole?: boolean;
}) {
  if (!items.length) return <WorkspaceEmpty text="暂无流转到你负责阶段的事项" />;
  return (
    <div className="tsw-workspaceTableWrap">
      <table className="tsw-workspaceTable">
        <thead>
          <tr>
            <th>类型 / 标题</th>
            <th>项目</th>
            {showRole ? <th>我的角色</th> : null}
            <th>当前阶段</th>
            {showRole ? <th>截止时间</th> : null}
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.type}-${item.id}`}>
              <td>
                <span className="tsw-workspaceType" data-type={itemFilter(item)}>{itemTypeLabel(item)}</span>
                <strong>{item.code} · {item.title}</strong>
              </td>
              <td>{item.project_name}</td>
              {showRole ? <td>{item.role}</td> : null}
              <td>
                <span className="tsw-workspaceStatus" data-status={item.status}>{statusLabel(item.status)}</span>
              </td>
              {showRole ? (
                <td data-overdue={item.overdue ? 'true' : 'false'}>{dueLabel(item)}</td>
              ) : null}
              <td>
                <button type="button" className="tsw-linkBtn" onClick={() => onOpenProject(item.project_id)}>
                  查看详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function activityDotClass(tone?: string): string {
  const safe = tone && ['blue', 'green', 'orange', 'purple', 'red'].includes(tone) ? tone : 'blue';
  return `tsw-overviewActivityDot tsw-overviewActivityDot--${safe}`;
}

function WorkspaceActivityFeed({
  items,
  onOpenProject,
}: {
  items: WorkspaceActivity[];
  onOpenProject: (projectId: number) => void;
}) {
  if (!items.length) return <WorkspaceEmpty text="暂无项目动态" />;
  return (
    <ul className="tsw-overviewActivityList tsw-workspaceActivityList">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}-${item.occurred_at}`}>
          <button
            type="button"
            className="tsw-workspaceActivityItem"
            onClick={() => onOpenProject(item.project_id)}
          >
            <i className={activityDotClass(item.tone)} />
            <div>
              <p>{item.text}</p>
              <span className="tsw-muted">
                {item.project_name}
                {item.code ? ` · ${item.code}` : ''}
                {' · '}
                {formatRelativeFromISO(item.occurred_at)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function WeekMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="tsw-workspaceWeekMetric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <i aria-hidden="true"><b /><b /><b /><b /><b /></i>
    </div>
  );
}

function WorkspaceEmpty({ text }: { text: string }) {
  return <p className="tsw-muted tsw-workspaceEmpty">{text}</p>;
}
