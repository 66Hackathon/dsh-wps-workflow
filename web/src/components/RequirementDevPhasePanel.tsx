import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { DevPhaseViewContext, DevTrackKey } from '../devPhaseRole';
import { resolveDevPhaseView } from '../devPhaseRole';
import { userAvatarColor, userAvatarLetter, userDisplayName } from '../memberRoles';
import type { ProjectMember, Requirement } from '../types';

interface DevTrackConfig {
  key: DevTrackKey;
  title: string;
  roleTag: string;
  progress: number;
  statusLabel: string;
  planTitle: string;
  planVersion: string;
  repoLabel: string;
  taskLabel: string;
  commitLabel: string;
  validations: string[];
  devSteps: { label: string; state: 'completed' | 'current' | 'upcoming' }[];
  tasks: { title: string; state: 'completed' | 'current' | 'pending' }[];
}

interface Props {
  requirement: Requirement;
  members: ProjectMember[];
  frontendUserId?: number;
  backendUserId?: number;
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
  onLockedFeature: (label: string) => void;
}

/** 提交当前研发方向完成；全部所选方向完成后自动进入测试。 */
async function completeDevelopmentPhase(
  requirement: Requirement,
  options: {
    trackTitle?: string;
  },
): Promise<Requirement> {
  const trackHint = options.trackTitle ? `（${options.trackTitle}）` : '';
  const result = await api.completeDevelopment(requirement.id, {
    dev_summary: `Demo 提交：当前研发线已完成${trackHint}。相关 DSH/方案操作接口暂未接入，自动填充完成材料。`,
    implementation_notes: 'Demo 自动填充实现说明：记录当前研发线完成状态，等待另一研发线完成。',
  });
  return result.requirement;
}

const DEMO_TRACKS: Omit<DevTrackConfig, 'key'>[] = [
  {
    title: '前端研发',
    roleTag: '前端开发',
    progress: 60,
    statusLabel: '开发中',
    planTitle: '移动端流式卡片前端技术方案',
    planVersion: 'V0.2',
    repoLabel: 'teamspace-web · feat/stream-card',
    taskLabel: 'DSH 任务 · 执行中',
    commitLabel: 'a81f2c · feat: 流式卡片骨架 · 李明 · 2 小时前',
    validations: ['代码编译通过', '核心功能自测通过', 'UI/UX 自测通过'],
    devSteps: [
      { label: 'AI 生成方案', state: 'completed' },
      { label: '方案完善', state: 'completed' },
      { label: '代码开发', state: 'current' },
      { label: '开发完成', state: 'upcoming' },
    ],
    tasks: [
      { title: '流式卡片 UI 骨架', state: 'completed' },
      { title: 'SSE 消息渲染', state: 'current' },
      { title: '断线重连与状态恢复', state: 'pending' },
    ],
  },
  {
    title: '后端研发',
    roleTag: '后端开发',
    progress: 50,
    statusLabel: '开发中',
    planTitle: '移动端流式卡片后端技术方案',
    planVersion: 'V0.2',
    repoLabel: 'teamspace-server · feat/stream-card',
    taskLabel: 'DSH 任务 · 执行中',
    commitLabel: 'b3d9e7 · feat: SSE 推送接口 · 王强 · 5 小时前',
    validations: ['代码编译通过', '接口自测通过', '性能/安全自测通过'],
    devSteps: [
      { label: 'AI 生成方案', state: 'completed' },
      { label: '方案完善', state: 'completed' },
      { label: '代码开发', state: 'current' },
      { label: '开发完成', state: 'upcoming' },
    ],
    tasks: [
      { title: 'SSE 推送接口', state: 'completed' },
      { title: '流式消息聚合', state: 'current' },
      { title: '限流与鉴权', state: 'pending' },
    ],
  },
];

const DEMO_LOGS = [
  { time: '2026-09-02 16:48', actor: '前端负责人', action: '完成流式卡片 UI 骨架，进度 60%。' },
  { time: '2026-09-02 14:20', actor: '后端负责人', action: '提交后端研发方案 V0.2，接口设计中。' },
  { time: '2026-09-02 11:05', actor: '前端负责人', action: '提交前端研发方案 V0.2，开始开发。' },
  { time: '2026-08-29 10:32', actor: '项目负责人', action: '确认进入研发阶段，前后端分工已明确。' },
];

function memberByUserId(members: ProjectMember[], userId?: number): ProjectMember | null {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId) ?? null;
}

function trackOwnerId(
  key: DevTrackKey,
  frontendUserId?: number,
  backendUserId?: number,
): number | undefined {
  return key === 'frontend' ? frontendUserId : backendUserId;
}

function buildTracks(requirement: Requirement): DevTrackConfig[] {
  const directions = (requirement.dev_directions || 'FRONTEND')
    .split(',')
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);
  const needFrontend = directions.includes('FRONTEND') || directions.length === 0;
  const needBackend = directions.includes('BACKEND');

  return DEMO_TRACKS
    .map((track, index) => {
      const key: DevTrackKey = index === 0 ? 'frontend' : 'backend';
      if (key === 'frontend' && !needFrontend) return null;
      if (key === 'backend' && !needBackend) return null;
      const completed = key === 'frontend'
        ? Boolean(requirement.frontend_development_completed)
        : Boolean(requirement.backend_development_completed);
      return {
        key,
        ...track,
        ...(completed ? {
          progress: 100,
          statusLabel: '已完成',
          devSteps: track.devSteps.map((step) => ({ ...step, state: 'completed' as const })),
          tasks: track.tasks.map((task) => ({ ...task, state: 'completed' as const })),
        } : {}),
      };
    })
    .filter((track): track is DevTrackConfig => track != null);
}

function DevPhaseSummaryBar() {
  return (
    <div className="tsw-reqDevSummaryRow tsw-reqDevSummaryRowWide">
      <div className="tsw-reqDevSummaryCard">
        <span className="tsw-muted">产品需求文档</span>
        <strong>V1.0 已确认</strong>
      </div>
      <div className="tsw-reqDevSummaryCard">
        <span className="tsw-muted">计划周期</span>
        <strong>2026-08-29 ~ 2026-09-05</strong>
      </div>
      <div className="tsw-reqDevSummaryCard">
        <span className="tsw-muted">整体进度</span>
        <strong className="tsw-reqDevProgressValue">55%</strong>
      </div>
      <div className="tsw-reqDevSummaryCard">
        <span className="tsw-muted">阻塞项</span>
        <strong>无</strong>
      </div>
    </div>
  );
}

function DevStepper({ steps }: { steps: DevTrackConfig['devSteps'] }) {
  return (
    <ol className="tsw-reqDevStepper" aria-label="研发进度">
      {steps.map((step, index) => (
        <li key={step.label} className="tsw-reqDevStep" data-state={step.state}>
          <span className="tsw-reqDevStepIcon" aria-hidden="true">
            {step.state === 'completed' ? '✓' : index + 1}
          </span>
          <span className="tsw-reqDevStepLabel">{step.label}</span>
          {index < steps.length - 1 ? <span className="tsw-reqDevStepLine" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

interface DevTrackCardProps {
  config: DevTrackConfig;
  owner: ProjectMember | null;
  canOperate: boolean;
  readOnly?: boolean;
  submitting?: boolean;
  onLockedFeature: (label: string) => void;
  onSubmitComplete?: () => void;
}

function DevTrackCard({
  config,
  owner,
  canOperate,
  readOnly = false,
  submitting = false,
  onLockedFeature,
  onSubmitComplete,
}: DevTrackCardProps) {
  const ownerName = owner ? userDisplayName(owner.user_name) : '未指定';
  const disabledHint = canOperate
    ? undefined
    : readOnly
      ? '当前为只读观察视图'
      : '当前为他人负责的研发线，暂不可操作';

  return (
    <article className="tsw-reqDevTrackCard">
      <header className="tsw-reqDevTrackHead">
        <div>
          <h4 className="tsw-reqDevTrackTitle">{config.title}</h4>
          <div className="tsw-reqDevTrackOwner">
            <span
              className="tsw-userAvatar"
              style={{ background: userAvatarColor(ownerName) }}
              aria-hidden="true"
            >
              {userAvatarLetter(ownerName)}
            </span>
            <strong>{ownerName}</strong>
            <span className="tsw-reqRoleTag">{config.roleTag}</span>
            <span className="tsw-tag tsw-tagSuccess">{config.statusLabel}</span>
          </div>
        </div>
        <div className="tsw-reqDevTrackProgressWrap">
          <span className="tsw-muted">进度 {config.progress}%</span>
          <div className="tsw-reqDevTrackProgressBar" aria-hidden="true">
            <span style={{ width: `${config.progress}%` }} />
          </div>
        </div>
      </header>

      {!readOnly ? (
        <>
        <div className="tsw-reqDevTrackActions">
          {['研发方案', 'AI 生成初稿', '在线编辑', 'AI 修改', '版本记录'].map((label) => (
            <button
              key={label}
              type="button"
              className="tsw-btn tsw-btnGhost tsw-reqDevTrackActionBtn"
              disabled={!canOperate}
              title={disabledHint}
              onClick={() => {
                if (canOperate) onLockedFeature(label);
              }}
            >
              {label === '研发方案' ? `${label} ${config.planVersion}` : label}
            </button>
          ))}
        </div>

        <dl className="tsw-reqDevTrackMeta">
          <div><dt>代码仓库</dt><dd>{config.repoLabel}</dd></div>
          <div><dt>DSH 任务</dt><dd>{config.taskLabel}</dd></div>
          <div><dt>最近提交</dt><dd>{config.commitLabel}</dd></div>
        </dl>

        <ul className="tsw-reqDevTrackChecks">
          {config.validations.map((item) => (
            <li key={item}>
              <span className="tsw-reqDevTrackCheckIcon" aria-hidden="true">✓</span>
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="tsw-btn tsw-btnPrimary tsw-btnSolid tsw-reqDevTrackSubmit"
          disabled={!canOperate || submitting}
          title={disabledHint}
          onClick={() => {
            if (canOperate) onSubmitComplete?.();
          }}
        >
          {submitting ? '提交中…' : '提交研发完成'}
        </button>
        <p className="tsw-muted tsw-reqDevTrackSubmitHint">
          {canOperate
            ? '可直接提交当前方向研发完成；全部方向完成后将进入测试。'
            : '该操作仅由对应研发负责人执行。'}
        </p>
        </>
      ) : null}
    </article>
  );
}

function DevCollaborationLog() {
  return (
    <section className="tsw-card tsw-reqDetailSection">
      <h3 className="tsw-reqSectionTitle">研发协作记录</h3>
      <ol className="tsw-reqDevLogList">
        {DEMO_LOGS.map((log) => (
          <li key={`${log.time}-${log.actor}`} className="tsw-reqDevLogItem">
            <span className="tsw-reqDevLogTime">{log.time}</span>
            <div>
              <strong>{log.actor}</strong>
              <p className="tsw-muted">{log.action}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface DeveloperMainProps {
  track: DevTrackConfig;
  owner: ProjectMember | null;
  onLockedFeature: (label: string) => void;
}

function DevPhaseDeveloperMain({ track, owner, onLockedFeature }: DeveloperMainProps) {
  const ownerName = owner ? userDisplayName(owner.user_name) : '未指定';

  return (
    <>
      <section className="tsw-card tsw-reqDetailSection">
        <DevPhaseSummaryBar />
        <h3 className="tsw-reqSectionTitle">{track.title}进度</h3>
        <DevStepper steps={track.devSteps} />

        <div className="tsw-reqDevPlanCard">
          <div className="tsw-reqDevPlanHead">
            <div>
              <span className="tsw-muted">研发方案</span>
              <strong>{track.planTitle}</strong>
            </div>
            <span className="tsw-tag tsw-tagSuccess">已确认</span>
          </div>
          <div className="tsw-reqDevPlanActions">
            <button type="button" className="tsw-btn tsw-btnGhost" onClick={() => onLockedFeature('查看研发方案')}>
              查看方案
            </button>
            <button type="button" className="tsw-btn" onClick={() => onLockedFeature('继续完善方案')}>
              继续完善
            </button>
          </div>
        </div>

        <h4 className="tsw-reqDevSubTitle">开发任务</h4>
        <ul className="tsw-reqDevTaskList">
          {track.tasks.map((task) => (
            <li key={task.title} className="tsw-reqDevTaskItem" data-state={task.state}>
              <span className="tsw-reqDevTaskIcon" aria-hidden="true">
                {task.state === 'completed' ? '✓' : task.state === 'current' ? '▶' : '○'}
              </span>
              <span>{task.title}</span>
              <span className="tsw-reqDevTaskState">
                {task.state === 'completed' ? '已完成' : task.state === 'current' ? '进行中' : '待开始'}
              </span>
            </li>
          ))}
        </ul>

        <h4 className="tsw-reqDevSubTitle">代码进度</h4>
        <div className="tsw-reqDevCodeCard">
          <dl className="tsw-reqDevTrackMeta">
            <div><dt>仓库/分支</dt><dd>{track.repoLabel}</dd></div>
            <div><dt>提交数</dt><dd>5 次</dd></div>
            <div><dt>最近提交</dt><dd>{track.commitLabel}</dd></div>
          </dl>
          <div className="tsw-reqDevCodeActions">
            <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={() => onLockedFeature('进入 DSH 继续开发')}>
              进入 DSH 继续开发
            </button>
            <button type="button" className="tsw-btn tsw-btnGhost" onClick={() => onLockedFeature('查看提交记录')}>
              查看提交
            </button>
          </div>
        </div>
      </section>

      <section className="tsw-card tsw-reqDetailSection">
        <h3 className="tsw-reqSectionTitle">{track.title}动态</h3>
        <p className="tsw-muted tsw-reqDevAssignHint">
          负责人 {ownerName} 的研发活动记录。
        </p>
        <ol className="tsw-reqDevLogList">
          {DEMO_LOGS.filter((log) => log.actor.includes(track.key === 'frontend' ? '前端' : '后端')).map((log) => (
            <li key={`${log.time}-${log.actor}`} className="tsw-reqDevLogItem">
              <span className="tsw-reqDevLogTime">{log.time}</span>
              <div>
                <strong>{log.actor}</strong>
                <p className="tsw-muted">{log.action}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

interface ProductObserverMainProps {
  tracks: DevTrackConfig[];
  members: ProjectMember[];
  requirement: Requirement;
  frontendUserId?: number;
  backendUserId?: number;
  currentUserId?: number;
  readOnly: boolean;
  onRequirementUpdated: (requirement: Requirement) => void;
  onLockedFeature: (label: string) => void;
}

function DevPhaseOverviewMain({
  tracks,
  members,
  requirement,
  frontendUserId,
  backendUserId,
  currentUserId,
  readOnly,
  onRequirementUpdated,
  onLockedFeature,
}: ProductObserverMainProps) {
  const [submittingTrack, setSubmittingTrack] = useState<DevTrackKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canOperateTrack = (key: DevTrackKey) => {
    if (readOnly || !currentUserId) return false;
    return trackOwnerId(key, frontendUserId, backendUserId) === currentUserId;
  };

  const handleSubmitComplete = async (track: DevTrackConfig) => {
    setSubmittingTrack(track.key);
    setActionError(null);
    try {
      const updated = await completeDevelopmentPhase(requirement, {
        trackTitle: track.title,
      });
      onRequirementUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmittingTrack(null);
    }
  };

  return (
    <>
      <section className="tsw-card tsw-reqDetailSection">
        <DevPhaseSummaryBar />
        <h3 className="tsw-reqSectionTitle">研发进度</h3>
        <p className="tsw-muted tsw-reqDevAssignHint">
          当前为研发进度视图，研发操作仅对对应的前后端负责人开放。
        </p>
        <div className="tsw-reqDevTrackGrid">
          {tracks.map((track) => (
            <DevTrackCard
              key={track.key}
              config={track}
              owner={memberByUserId(members, trackOwnerId(track.key, frontendUserId, backendUserId))}
              canOperate={canOperateTrack(track.key)}
              readOnly={readOnly}
              submitting={submittingTrack === track.key}
              onLockedFeature={onLockedFeature}
              onSubmitComplete={() => void handleSubmitComplete(track)}
            />
          ))}
        </div>
        {actionError ? <p className="tsw-error">{actionError}</p> : null}
      </section>
      <DevCollaborationLog />
    </>
  );
}

function DevPhaseDeveloperAside({
  track,
  requirement,
  onRequirementUpdated,
  onLockedFeature,
}: {
  track: DevTrackConfig;
  requirement: Requirement;
  onRequirementUpdated: (requirement: Requirement) => void;
  onLockedFeature: (label: string) => void;
}) {
  const peerLabel = track.key === 'frontend' ? '后端' : '前端';
  const ownCompleted = track.key === 'frontend'
    ? requirement.frontend_development_completed
    : requirement.backend_development_completed;
  const peerCompleted = track.key === 'frontend'
    ? requirement.backend_development_completed
    : requirement.frontend_development_completed;
  const directions = (requirement.dev_directions || 'FRONTEND')
    .split(',')
    .map((direction) => direction.trim().toUpperCase());
  const needsFrontend = directions.includes('FRONTEND');
  const needsBackend = directions.includes('BACKEND');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSubmitComplete = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await completeDevelopmentPhase(requirement, {
        trackTitle: track.title,
      });
      onRequirementUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="tsw-card tsw-reqAsideCard">
        <h4 className="tsw-reqAsideTitle">可用操作</h4>
        <div className="tsw-reqDevAsideActions">
          <button type="button" className="tsw-btn tsw-reqAsideSecondaryBtn" onClick={() => onLockedFeature('完善研发方案')}>
            完善{track.title}方案
          </button>
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid tsw-reqAsidePrimaryBtn" onClick={() => onLockedFeature('进入 DSH 继续开发')}>
            继续{track.title}
          </button>
          <button
            type="button"
            className="tsw-btn tsw-reqAsideSecondaryBtn"
            disabled={submitting || ownCompleted}
            onClick={() => void handleSubmitComplete()}
          >
            {submitting ? '提交中…' : ownCompleted ? `${track.title}已提交` : `提交${track.title}完成`}
          </button>
        </div>
        <p className="tsw-muted tsw-reqAsideHint">
          {ownCompleted && !peerCompleted
            ? `${track.title}已完成，等待${peerLabel}研发提交。`
            : '前端与后端研发均提交完成后，需求才会进入测试阶段。'}
        </p>
        {actionError ? <p className="tsw-error">{actionError}</p> : null}
      </div>

      <div className="tsw-card tsw-reqAsideCard">
        <h4 className="tsw-reqAsideTitle">跨端信息查询</h4>
        <p className="tsw-muted tsw-reqAsideHint">
          研发成员可查询对端进展，默认不在本视图展开。
        </p>
        <button type="button" className="tsw-btn tsw-reqAsideSecondaryBtn" onClick={() => onLockedFeature(`查询${peerLabel}研发信息`)}>
          查询{peerLabel}研发信息
        </button>
        <button type="button" className="tsw-linkBtn tsw-reqDevPeerLink" onClick={() => onLockedFeature('查询接口约定')}>
          查询接口约定 →
        </button>
      </div>

      <div className="tsw-card tsw-reqAsideCard">
        <h4 className="tsw-reqAsideTitle">进入测试条件</h4>
        <ul className="tsw-reqDevCriteriaList">
          {needsFrontend ? (
            <li data-done={requirement.frontend_development_completed ? 'true' : 'false'}>
              <span className="tsw-reqDevCriteriaIcon" aria-hidden="true">
                {requirement.frontend_development_completed ? '✓' : '○'}
              </span>
              前端研发已提交完成
            </li>
          ) : null}
          {needsBackend ? (
            <li data-done={requirement.backend_development_completed ? 'true' : 'false'}>
              <span className="tsw-reqDevCriteriaIcon" aria-hidden="true">
                {requirement.backend_development_completed ? '✓' : '○'}
              </span>
              后端研发已提交完成
            </li>
          ) : null}
        </ul>
      </div>
    </>
  );
}

export function DevPhaseViewBadge({ viewContext }: { viewContext: DevPhaseViewContext }) {
  return (
    <span className="tsw-reqDevViewBadge" title="当前身份对应的研发阶段视图">
      {viewContext.viewLabel}
    </span>
  );
}

export function RequirementDevPhaseMain({
  requirement,
  members,
  frontendUserId,
  backendUserId,
  currentUserId,
  onRequirementUpdated,
  onLockedFeature,
}: Props) {
  const tracks = useMemo(
    () => buildTracks(requirement),
    [
      requirement.dev_directions,
      requirement.frontend_development_completed,
      requirement.backend_development_completed,
    ],
  );
  const viewContext = useMemo(
    () => resolveDevPhaseView(currentUserId, requirement, members, frontendUserId, backendUserId),
    [currentUserId, requirement, members, frontendUserId, backendUserId],
  );

  if (viewContext.role === 'developer' && viewContext.track) {
    const track = tracks.find((t) => t.key === viewContext.track);
    if (!track) {
      return (
        <DevPhaseOverviewMain
          tracks={tracks}
          members={members}
          requirement={requirement}
          frontendUserId={frontendUserId}
          backendUserId={backendUserId}
          currentUserId={currentUserId}
          readOnly={false}
          onRequirementUpdated={onRequirementUpdated}
          onLockedFeature={onLockedFeature}
        />
      );
    }
    const owner = memberByUserId(members, trackOwnerId(viewContext.track, frontendUserId, backendUserId));
    return <DevPhaseDeveloperMain track={track} owner={owner} onLockedFeature={onLockedFeature} />;
  }

  return (
    <DevPhaseOverviewMain
      tracks={tracks}
      members={members}
      requirement={requirement}
      frontendUserId={frontendUserId}
      backendUserId={backendUserId}
      currentUserId={currentUserId}
      readOnly={viewContext.role !== 'developer'}
      onRequirementUpdated={onRequirementUpdated}
      onLockedFeature={onLockedFeature}
    />
  );
}

export function RequirementDevPhaseAside(props: Props) {
  const { requirement, members, frontendUserId, backendUserId, currentUserId, onRequirementUpdated, onLockedFeature } = props;
  const viewContext = useMemo(
    () => resolveDevPhaseView(currentUserId, requirement, members, frontendUserId, backendUserId),
    [currentUserId, requirement, members, frontendUserId, backendUserId],
  );
  const tracks = useMemo(
    () => buildTracks(requirement),
    [
      requirement.dev_directions,
      requirement.frontend_development_completed,
      requirement.backend_development_completed,
    ],
  );

  if (viewContext.role === 'developer' && viewContext.track) {
    const track = tracks.find((t) => t.key === viewContext.track);
    if (!track) return null;
    return (
      <DevPhaseDeveloperAside
        track={track}
        requirement={requirement}
        onRequirementUpdated={onRequirementUpdated}
        onLockedFeature={onLockedFeature}
      />
    );
  }

  return null;
}

export function useDevPhaseViewContext(
  requirement: Requirement,
  members: ProjectMember[],
  currentUserId?: number,
  frontendUserId?: number,
  backendUserId?: number,
): DevPhaseViewContext {
  return useMemo(
    () => resolveDevPhaseView(currentUserId, requirement, members, frontendUserId, backendUserId),
    [currentUserId, requirement, members, frontendUserId, backendUserId],
  );
}
