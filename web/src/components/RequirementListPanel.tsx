import { useMemo, useState, type ReactNode } from 'react';
import type { ProjectMember, Requirement } from '../types';
import { formatRelativeFromISO } from '../projectDisplay';
import { userAvatarColor, userAvatarLetter, userDisplayName } from '../memberRoles';
import {
  countRequirementsByKind,
  countRequirementsByLifecycle,
  filterRequirements,
  isBugFixRequirement,
  REQUIREMENT_KIND_FILTERS,
  requirementKindLabel,
  requirementOwnerIds,
  requirementStatusLabel,
  requirementStatusTone,
  type RequirementKindFilter,
  type RequirementLifecycleFilter,
} from '../requirementDisplay';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

interface Props {
  requirements: Requirement[];
  members: ProjectMember[];
  loading?: boolean;
  onCreate: () => void;
  onOpen: (requirementId: number) => void;
}

export function RequirementListPanel({
  requirements,
  members,
  loading,
  onCreate,
  onOpen,
}: Props) {
  const [query, setQuery] = useState('');
  const [lifecycle, setLifecycle] = useState<RequirementLifecycleFilter>('all');
  const [kind, setKind] = useState<RequirementKindFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(
    () => filterRequirements(requirements, query, lifecycle, kind, undefined, members),
    [requirements, query, lifecycle, kind, members],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const stats = {
    all: requirements.length,
    requirement: countRequirementsByKind(requirements, 'requirement'),
    bug: countRequirementsByKind(requirements, 'bug'),
    active: countRequirementsByLifecycle(requirements, 'active'),
    archived: countRequirementsByLifecycle(requirements, 'archived'),
  };

  const resetPage = () => setPage(1);

  const applyKind = (next: RequirementKindFilter) => {
    setKind(next);
    resetPage();
  };

  const applyLifecycle = (next: RequirementLifecycleFilter) => {
    setLifecycle(next);
    resetPage();
  };

  return (
    <div className="tsw-reqBoard">
      <div className="tsw-card tsw-reqBoardMain">
        <div className="tsw-listHeaderRow">
          <div>
            <h3 className="tsw-reqBoardTitle">需求列表</h3>
            <p className="tsw-muted tsw-reqBoardDesc">
              管理项目中的需求与缺陷，状态按条目流转。
            </p>
          </div>
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onCreate}>
            + 创建需求
          </button>
        </div>

        <div className="tsw-reqBoardToolbar">
          <div className="tsw-searchWrap tsw-reqBoardSearch">
            <span className="tsw-searchIcon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="search"
              className="tsw-searchInput"
              placeholder="搜索标题、编号或负责人"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="tsw-reqBoardTypeRow">
            <span className="tsw-muted">类型</span>
            <div className="tsw-filterTabs" role="tablist" aria-label="类型">
              {REQUIREMENT_KIND_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  className="tsw-filterTab"
                  data-active={kind === key ? 'true' : 'false'}
                  onClick={() => applyKind(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? <p>加载中…</p> : null}

        {!loading && pageItems.length ? (
          <div className="tsw-reqTableWrap">
            <table className="tsw-reqTable">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>类型</th>
                  <th>标题</th>
                  <th>当前状态</th>
                  <th>负责人</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((req) => (
                  <tr key={req.id}>
                    <td className="tsw-reqTableCode">{req.requirement_code}</td>
                    <td>
                      <span className="tsw-kindTag" data-kind={isBugFixRequirement(req) ? 'bug' : 'req'}>
                        {requirementKindLabel(req)}
                      </span>
                    </td>
                    <td className="tsw-reqTableTitle">{req.title}</td>
                    <td>
                      <span className="tsw-reqStatus" data-tone={requirementStatusTone(req.current_status)}>
                        {requirementStatusLabel(req.current_status)}
                      </span>
                    </td>
                    <td>
                      <OwnerCell members={members} requirement={req} />
                    </td>
                    <td className="tsw-muted">{formatRelativeFromISO(req.updated_at)}</td>
                    <td>
                      <button type="button" className="tsw-linkBtn" onClick={() => onOpen(req.id)}>
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !pageItems.length ? (
          <p className="tsw-muted tsw-reqBoardEmpty">
            {requirements.length ? '没有匹配的条目，试试调整搜索或筛选。' : '暂无需求，点击「创建需求」开始录入。'}
          </p>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <div className="tsw-reqPager">
            <span className="tsw-muted">共 {filtered.length} 条</span>
            <div className="tsw-reqPagerPages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 7).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="tsw-pagerBtn"
                  data-active={n === currentPage ? 'true' : 'false'}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="tsw-reqPagerSize">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} 条/页</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <aside className="tsw-reqBoardAside">
        <StatCard
          label="全部"
          value={stats.all}
          tone="blue"
          active={kind === 'all' && lifecycle === 'all'}
          icon={<IconFolder />}
          onClick={() => {
            applyKind('all');
            applyLifecycle('all');
          }}
        />
        <StatCard
          label="需求"
          value={stats.requirement}
          tone="purple"
          active={kind === 'requirement'}
          icon={<IconDoc />}
          onClick={() => applyKind('requirement')}
        />
        <StatCard
          label="Bug"
          value={stats.bug}
          tone="red"
          active={kind === 'bug'}
          icon={<IconBug />}
          onClick={() => applyKind('bug')}
        />
        <StatCard
          label="进行中"
          value={stats.active}
          tone="orange"
          active={lifecycle === 'active'}
          icon={<IconBolt />}
          onClick={() => applyLifecycle('active')}
        />
        <StatCard
          label="已归档"
          value={stats.archived}
          tone="brown"
          active={lifecycle === 'archived'}
          icon={<IconBox />}
          onClick={() => applyLifecycle('archived')}
        />
      </aside>
    </div>
  );
}

function OwnerCell({
  members,
  requirement,
}: {
  members: ProjectMember[];
  requirement: Requirement;
}) {
  const owners = requirementOwnerIds(requirement)
    .map((id) => members.find((m) => m.user_id === id))
    .filter((m): m is ProjectMember => Boolean(m));
  if (!owners.length) return <span className="tsw-muted">未指定</span>;
  return (
    <div className="tsw-ownerCell">
      {owners.slice(0, 3).map((member) => (
        <span key={member.id} className="tsw-ownerChip">
          <span className="tsw-memberAvatar tsw-memberAvatarSm" style={{ background: userAvatarColor(member.user_name) }}>
            {userAvatarLetter(member.user_name)}
          </span>
          {userDisplayName(member.user_name)}
        </span>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tsw-reqStatCard"
      data-tone={tone}
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="tsw-reqStatIcon" aria-hidden="true">{icon}</span>
      <span>
        <strong>{value}</strong>
        <em>{label}</em>
      </span>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

function IconBug() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 9h8v7a4 4 0 0 1-8 0V9z" />
      <path d="M12 9V6M7 6l2 3M17 6l-2 3M5 12h3M16 12h3M6 17l2-1M18 17l-2-1" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}
