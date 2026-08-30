import { useMemo, useState } from 'react';
import type { Project } from '../types';
import type { RecentProjectVisit } from '../projectDisplay';
import {
  filterProjects,
  formatRelativeFromISO,
  formatRelativeTime,
  memberCountLabel,
  memberRoleLabel,
  projectIcon,
  projectIconStyle,
} from '../projectDisplay';
import { userAvatarColor, userAvatarLetter } from '../memberRoles';

interface Props {
  projects: Project[];
  loading: boolean;
  currentUserId?: number;
  recentVisits: RecentProjectVisit[];
  onSelectProject: (id: number) => void;
  onOpenProjectSettings: (id: number) => void;
  onCreateClick: () => void;
}

export function ProjectList({
  projects,
  loading,
  currentUserId,
  recentVisits,
  onSelectProject,
  onOpenProjectSettings,
  onCreateClick,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => filterProjects(projects, query, 'all'),
    [projects, query],
  );

  const recentRows = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    return recentVisits
      .map((visit) => ({ visit, project: byId.get(visit.projectId) }))
      .filter((row) => row.project != null)
      .slice(0, 5);
  }, [projects, recentVisits]);

  if (loading) {
    return (
      <div className="tsw-projectSpace">
        <div className="tsw-emptyState">
          <p className="tsw-muted">加载项目列表…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tsw-projectSpace">
      <div className="tsw-projectSpaceHeader">
        <div>
          <h2 className="tsw-projectSpaceTitle">项目空间</h2>
          <p className="tsw-projectSpaceSubtitle">
            选择一个项目进入需求列表，或创建新的项目
          </p>
        </div>
        <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnCreate" onClick={onCreateClick}>
          + 创建项目
        </button>
      </div>

      <div className="tsw-projectSpaceToolbar">
        <div className="tsw-searchWrap">
          <span className="tsw-searchIcon" aria-hidden="true">🔍</span>
          <input
            type="search"
            className="tsw-searchInput"
            placeholder="搜索项目名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <section className="tsw-projectSection">
        <h3 className="tsw-sectionTitle">我参与的项目</h3>
        {!filtered.length ? (
          <div className="tsw-emptyState tsw-emptyStateInline">
            <p className="tsw-muted">
              {projects.length
                ? '没有匹配的项目，试试调整搜索条件。'
                : '暂无项目。点击右上角「创建项目」开始协作。'}
            </p>
          </div>
        ) : (
          <div className="tsw-projectGrid">
            {filtered.map((project) => {
              const iconStyle = projectIconStyle(project);
              const members = project.members ?? [];
              const previewMembers = members.slice(0, 4);
              return (
                <article key={project.id} className="tsw-projectCard">
                  <div className="tsw-projectCardTop">
                    <span
                      className="tsw-projectCardIcon"
                      style={{ background: iconStyle.background, color: iconStyle.color }}
                      aria-hidden="true"
                    >
                      {projectIcon(project)}
                    </span>
                    <div className="tsw-projectCardBody">
                      <h4 className="tsw-projectCardTitle">{project.name}</h4>
                      <p className="tsw-projectCardDesc">
                        {project.description || '暂无项目介绍'}
                      </p>
                    </div>
                  </div>

                  <div className="tsw-projectCardMembers">
                    <div className="tsw-avatarStack">
                      {previewMembers.map((member) => (
                        <span
                          key={member.id}
                          className="tsw-avatarStackItem"
                          style={{ background: userAvatarColor(member.user_name) }}
                          title={member.user_name}
                        >
                          {userAvatarLetter(member.user_name)}
                        </span>
                      ))}
                    </div>
                    <span>{memberCountLabel(project)}</span>
                  </div>

                  <div className="tsw-projectCardStats">
                    <span><em>需求</em> {project.requirement_count ?? 0}</span>
                    <span><em>Bug</em> {project.bug_count ?? 0}</span>
                    <span><em>最近更新</em> {formatRelativeFromISO(project.updated_at)}</span>
                  </div>

                  <p className="tsw-projectCardRole">
                    我的角色：{memberRoleLabel(project, currentUserId)}
                  </p>

                  <div className="tsw-projectCardActions">
                    <button
                      type="button"
                      className="tsw-btn tsw-btnSolid"
                      onClick={() => onSelectProject(project.id)}
                    >
                      进入项目
                    </button>
                    <button
                      type="button"
                      className="tsw-btn tsw-btnOutline"
                      onClick={() => onOpenProjectSettings(project.id)}
                    >
                      ⚙ 项目设置
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {recentRows.length > 0 ? (
        <section className="tsw-projectSection">
          <h3 className="tsw-sectionTitle">最近访问</h3>
          <ul className="tsw-recentList">
            {recentRows.map(({ visit, project }) => (
              <li key={visit.projectId}>
                <button
                  type="button"
                  className="tsw-recentItem"
                  onClick={() => onSelectProject(visit.projectId)}
                >
                  <span
                    className="tsw-recentIcon"
                    style={projectIconStyle(project!)}
                    aria-hidden="true"
                  >
                    {projectIcon(project!)}
                  </span>
                  <span className="tsw-recentText">
                    <span className="tsw-recentName">{visit.projectName}</span>
                    <span className="tsw-recentSnippet">{visit.snippet}</span>
                  </span>
                  <span className="tsw-recentTime">{formatRelativeTime(visit.visitedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
