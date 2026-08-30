import {
  buildActivityFeed,
  buildOverviewStats,
  buildPhaseSegments,
  overviewStatusLabel,
  overviewStatusTone,
  resolveRequirementOwner,
} from '../overviewStats';
import { isProjectAdmin, userAvatarColor, userAvatarLetter } from '../memberRoles';
import type { Bug, Project, ProjectMember, Requirement } from '../types';

interface Props {
  project: Project;
  members: ProjectMember[];
  requirements: Requirement[];
  bugs: Bug[];
  loading?: boolean;
  onViewAllRequirements?: () => void;
  onViewAllMembers?: () => void;
}

function statToneClass(tone: string): string {
  return `tsw-overviewStatCard tsw-overviewStatCard--${tone}`;
}

function statusDotClass(tone: string): string {
  return `tsw-overviewStatusDot tsw-overviewStatusDot--${tone}`;
}

function activityDotClass(tone: string): string {
  return `tsw-overviewActivityDot tsw-overviewActivityDot--${tone}`;
}

export function ProjectOverview({
  project,
  members,
  requirements,
  bugs,
  loading,
  onViewAllRequirements,
  onViewAllMembers,
}: Props) {
  const stats = buildOverviewStats(requirements, bugs);
  const phases = buildPhaseSegments(requirements);
  const phaseTotal = phases.reduce((sum, p) => sum + p.count, 0) || 1;
  const recentRequirements = [...requirements].slice(0, 5);
  const activity = buildActivityFeed(requirements, members);
  const previewMembers = members.slice(0, 5);

  const owner = members.find((m) => m.user_id === project.owner_user_id)
    ?? members.find((m) => isProjectAdmin(m));

  const integrations = [
    {
      key: 'git',
      label: '代码仓库',
      linked: Boolean(project.git_repo_url?.trim()),
      detail: project.git_repo_url ? '已关联' : '未关联',
    },
    {
      key: 'group',
      label: '项目群',
      linked: Boolean(project.wps_group_id?.trim()),
      detail: project.wps_group_name || '未关联',
    },
    {
      key: 'docs',
      label: '项目文档',
      linked: false,
      detail: '0 篇',
    },
    {
      key: 'ai',
      label: 'AI 能力',
      linked: false,
      detail: '未启用',
    },
  ];

  if (loading) {
    return (
      <div className="tsw-card tsw-empty">
        <p className="tsw-muted">加载项目概览…</p>
      </div>
    );
  }

  return (
    <div className="tsw-overview">
      <div className="tsw-overviewStatRow">
        {stats.map((stat) => (
          <div key={stat.key} className={statToneClass(stat.tone)}>
            <span className="tsw-overviewStatLabel">{stat.label}</span>
            <strong className="tsw-overviewStatValue">{stat.value}</strong>
            {stat.hint ? <span className="tsw-overviewStatHint">{stat.hint}</span> : null}
          </div>
        ))}
      </div>

      <div className="tsw-overviewGrid">
        <div className="tsw-card tsw-overviewPanel">
          <h4 className="tsw-overviewPanelTitle">需求阶段分布</h4>
          {phases.length ? (
            <>
              <div className="tsw-overviewPhaseBar" role="img" aria-label="需求阶段分布">
                {phases.map((phase) => (
                  <div
                    key={phase.key}
                    className="tsw-overviewPhaseSegment"
                    style={{
                      flexGrow: phase.count,
                      background: phase.color,
                    }}
                    title={`${phase.label} ${phase.count}`}
                  />
                ))}
              </div>
              <div className="tsw-overviewPhaseLegend">
                {phases.map((phase) => (
                  <span key={phase.key} className="tsw-overviewPhaseLegendItem">
                    <i style={{ background: phase.color }} />
                    {phase.label} {phase.count}
                  </span>
                ))}
              </div>
              <p className="tsw-muted tsw-overviewPhaseNote">
                共 {phaseTotal} 项活跃需求分布在各阶段
              </p>
            </>
          ) : (
            <p className="tsw-muted">暂无需求，创建后将在此展示阶段分布。</p>
          )}
        </div>

        <div className="tsw-card tsw-overviewPanel">
          <h4 className="tsw-overviewPanelTitle">项目成员</h4>
          <ul className="tsw-overviewMemberList">
            {previewMembers.map((member) => {
              const admin = isProjectAdmin(member);
              return (
                <li key={member.id} className="tsw-overviewMemberItem">
                  <span
                    className="tsw-memberAvatar"
                    style={{ background: userAvatarColor(member.user_name) }}
                  >
                    {userAvatarLetter(member.user_name)}
                  </span>
                  <span className="tsw-overviewMemberName">{member.user_name}</span>
                  <span className={`tsw-tag tsw-overviewAdminTag${admin ? '' : ' tsw-tagMuted'}`}>
                    {admin ? '管理员' : '普通成员'}
                  </span>
                </li>
              );
            })}
          </ul>
          {!previewMembers.length ? (
            <p className="tsw-muted">暂无成员</p>
          ) : null}
          {members.length > previewMembers.length ? (
            <button
              type="button"
              className="tsw-linkBtn tsw-overviewLink"
              onClick={onViewAllMembers}
            >
              查看全部 {members.length} 名成员 →
            </button>
          ) : null}
        </div>

        <div className="tsw-card tsw-overviewPanel">
          <h4 className="tsw-overviewPanelTitle">项目接入状态</h4>
          <ul className="tsw-overviewIntegrationList">
            {integrations.map((item) => (
              <li key={item.key} className="tsw-overviewIntegrationItem">
                <div>
                  <strong>{item.label}</strong>
                  <span className="tsw-muted">{item.detail}</span>
                </div>
                <span className={`tsw-tag ${item.linked ? 'tsw-tagSuccess' : 'tsw-tagMuted'}`}>
                  {item.linked ? '已接入' : '暂未开放'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="tsw-overviewBottomGrid">
        <div className="tsw-card tsw-overviewPanel">
          <h4 className="tsw-overviewPanelTitle">最近更新的需求</h4>
          {recentRequirements.length ? (
            <div className="tsw-overviewTableWrap">
              <table className="tsw-overviewTable">
                <thead>
                  <tr>
                    <th>需求名称</th>
                    <th>当前阶段</th>
                    <th>负责人</th>
                    <th>更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequirements.map((req) => {
                    const tone = overviewStatusTone(req.current_status);
                    return (
                      <tr key={req.id}>
                        <td>{req.title}</td>
                        <td>
                          <span className="tsw-overviewStatusCell">
                            <i className={statusDotClass(tone)} />
                            {overviewStatusLabel(req.current_status)}
                          </span>
                        </td>
                        <td>{resolveRequirementOwner(req, members)}</td>
                        <td className="tsw-muted">刚刚</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="tsw-muted">暂无需求记录。</p>
          )}
          <button
            type="button"
            className="tsw-linkBtn tsw-overviewLink"
            onClick={onViewAllRequirements}
          >
            查看全部需求 →
          </button>
        </div>

        <div className="tsw-card tsw-overviewPanel">
          <h4 className="tsw-overviewPanelTitle">最近动态</h4>
          {activity.length ? (
            <ul className="tsw-overviewActivityList">
              {activity.map((item) => (
                <li key={item.id} className="tsw-overviewActivityItem">
                  <i className={activityDotClass(item.tone)} />
                  <div>
                    <p>{item.text}</p>
                    <span className="tsw-muted">{item.timeLabel}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tsw-muted">暂无项目动态。</p>
          )}
        </div>
      </div>

      <p className="tsw-muted tsw-overviewMeta">
        管理员：{owner?.user_name ?? '—'} · {members.length} 名成员
      </p>
    </div>
  );
}
