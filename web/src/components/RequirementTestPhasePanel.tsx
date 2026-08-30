import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { formatRelativeFromISO } from '../projectDisplay';
import { userAvatarColor, userAvatarLetter, userDisplayName } from '../memberRoles';
import type { TestPhaseViewContext } from '../testPhaseRole';
import { resolveTestPhaseView } from '../testPhaseRole';
import type { Bug, ProjectMember, Requirement } from '../types';

interface Props {
  requirement: Requirement;
  members: ProjectMember[];
  frontendUserId?: number;
  backendUserId?: number;
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
  onLockedFeature: (label: string) => void;
}

type TestWorkflowStep =
  | 'plan'
  | 'cases'
  | 'execute'
  | 'retest'
  | 'summary';

type StepState = 'completed' | 'current' | 'upcoming';

interface TestWorkflowContextValue {
  activeStep: TestWorkflowStep;
  setActiveStep: (step: TestWorkflowStep) => void;
  goNext: (from: TestWorkflowStep) => void;
  isTester: boolean;
}

const TestWorkflowContext = createContext<TestWorkflowContextValue | null>(null);

function useTestWorkflow() {
  const ctx = useContext(TestWorkflowContext);
  if (!ctx) {
    return {
      activeStep: 'summary' as TestWorkflowStep,
      setActiveStep: () => undefined,
      goNext: () => undefined,
      isTester: false,
    };
  }
  return ctx;
}

export function TestPhaseProvider({
  isTester,
  children,
}: {
  isTester: boolean;
  children: ReactNode;
}) {
  const [activeStep, setActiveStep] = useState<TestWorkflowStep>(isTester ? 'plan' : 'summary');

  const goNext = (from: TestWorkflowStep) => {
    const index = WORKFLOW_STEPS.findIndex((s) => s.id === from);
    const next = WORKFLOW_STEPS[index + 1];
    if (!next) return;
    setActiveStep(next.id);
  };

  const value = useMemo(
    () => ({ activeStep, setActiveStep, goNext, isTester }),
    [activeStep, isTester],
  );

  return (
    <TestWorkflowContext.Provider value={value}>
      {children}
    </TestWorkflowContext.Provider>
  );
}

const WORKFLOW_STEPS: { id: TestWorkflowStep; label: string }[] = [
  { id: 'plan', label: '测试方案' },
  { id: 'cases', label: '用例准备' },
  { id: 'execute', label: '执行测试' },
  { id: 'retest', label: '缺陷复测' },
  { id: 'summary', label: '结果汇总' },
];

const DEMO_CASES = [
  { id: 'TC-001', name: '正常退款流程', type: '功能', priority: 'P0', assignee: '小王', status: '已确认' },
  { id: 'TC-002', name: '重复提交拦截', type: '异常', priority: 'P0', assignee: '小赵', status: '待确认' },
  { id: 'TC-003', name: '权限不足提示', type: '功能', priority: 'P1', assignee: '小王', status: '已确认' },
  { id: 'TC-004', name: '网络超时重试', type: '异常', priority: 'P1', assignee: '小赵', status: '待确认' },
] as const;

function memberByUserId(members: ProjectMember[], userId?: number): ProjectMember | null {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId) ?? null;
}

function stepStates(activeIndex: number): StepState[] {
  return WORKFLOW_STEPS.map((_, index) => {
    if (index < activeIndex) return 'completed';
    if (index === activeIndex) return 'current';
    return 'upcoming';
  });
}

async function completeTestingPhase(
  requirement: Requirement,
  currentUserId?: number,
  conclusion = 'PASS',
  summary = 'Demo 提交：测试阶段已完成。',
): Promise<Requirement> {
  const testerId = requirement.tester_user_id ?? currentUserId;
  return api.transitionRequirement(requirement.id, 'DONE', {
    test_result: conclusion,
    test_summary: summary,
    test_cases_covered: '功能用例、异常用例、整体流程（Demo 自动覆盖）',
    tester_user_id: testerId,
    remark: 'Demo：提交测试结论并进入待验收',
  });
}

export function TestPhaseViewBadge({ viewContext }: { viewContext: TestPhaseViewContext }) {
  return (
    <span className="tsw-reqDevViewBadge" title="当前身份对应的测试阶段视图">
      {viewContext.viewLabel}
    </span>
  );
}

export function useTestPhaseViewContext(
  requirement: Requirement,
  members: ProjectMember[],
  currentUserId?: number,
  frontendUserId?: number,
  backendUserId?: number,
): TestPhaseViewContext {
  return useMemo(
    () => resolveTestPhaseView(currentUserId, requirement, members, frontendUserId, backendUserId),
    [currentUserId, requirement, members, frontendUserId, backendUserId],
  );
}

function WorkflowNav({
  activeStep,
  onSelect,
}: {
  activeStep: TestWorkflowStep;
  onSelect: (step: TestWorkflowStep) => void;
}) {
  const activeIndex = WORKFLOW_STEPS.findIndex((s) => s.id === activeStep);
  const states = stepStates(Math.max(activeIndex, 0));

  return (
    <nav className="tsw-reqTestWorkflow" aria-label="测试工作流程">
      <h4 className="tsw-reqTestWorkflowTitle">测试工作流程</h4>
      <ol className="tsw-reqTestWorkflowList">
        {WORKFLOW_STEPS.map((step, index) => (
          <li key={step.id} data-state={states[index]}>
            <button
              type="button"
              className="tsw-reqTestWorkflowBtn"
              data-active={step.id === activeStep ? 'true' : 'false'}
              onClick={() => onSelect(step.id)}
            >
              <span className="tsw-reqTestWorkflowIcon" aria-hidden="true">
                {states[index] === 'completed' ? '✓' : index + 1}
              </span>
              <span>{step.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function NonTesterTestProgress({ requirement }: { requirement: Requirement }) {
  const currentStepIndex = 2;
  const states = stepStates(currentStepIndex);

  return (
    <>
      <div className="tsw-reqDevSummaryRow tsw-reqTestProgressSummary">
        <div className="tsw-reqDevSummaryCard">
          <span className="tsw-muted">计划周期</span>
          <strong>2026-08-29 ~ 2026-09-05</strong>
        </div>
        <div className="tsw-reqDevSummaryCard">
          <span className="tsw-muted">当前阶段</span>
          <strong className="tsw-reqDevProgressValue">执行测试</strong>
        </div>
        <div className="tsw-reqDevSummaryCard">
          <span className="tsw-muted">阻塞项</span>
          <strong>无</strong>
        </div>
      </div>

      <section className="tsw-card tsw-reqDetailSection">
        <h3 className="tsw-reqSectionTitle">测试进度</h3>
        <ol className="tsw-reqDevStepper tsw-reqTestProgressStepper" aria-label="测试进度">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step.id} className="tsw-reqDevStep" data-state={states[index]}>
              <span className="tsw-reqDevStepIcon" aria-hidden="true">
                {states[index] === 'completed' ? '✓' : index + 1}
              </span>
              <span className="tsw-reqDevStepLabel">{step.label}</span>
              <span className="tsw-reqTestProgressState">
                {states[index] === 'completed'
                  ? '已完成'
                  : states[index] === 'current'
                    ? '进行中'
                    : '待开始'}
              </span>
              {index < WORKFLOW_STEPS.length - 1 ? (
                <span className="tsw-reqDevStepLine" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="tsw-muted tsw-reqTestProgressUpdated">
          最近更新：{formatRelativeFromISO(requirement.updated_at)}
        </p>
      </section>
    </>
  );
}

function PlanStep({
  requirement,
  testerName,
  canEdit,
  onConfirm,
  onLockedFeature,
}: {
  requirement: Requirement;
  testerName: string;
  canEdit: boolean;
  onConfirm: () => void;
  onLockedFeature: (label: string) => void;
}) {
  return (
    <section className="tsw-card tsw-reqDetailSection">
      <h3 className="tsw-reqSectionTitle">测试方案</h3>
      {canEdit ? (
        <div className="tsw-reqTestCreateGrid">
          <article className="tsw-reqTestCreateCard" data-disabled="true">
            <strong>AI 生成方案</strong>
            <p className="tsw-muted">根据需求文档自动生成测试方案初稿</p>
            <span className="tsw-tag tsw-tagMuted">暂未开放</span>
          </article>
          <article className="tsw-reqTestCreateCard">
            <strong>引入 WPS 文档</strong>
            <p className="tsw-muted">从云文档选择已有测试方案</p>
            <button type="button" className="tsw-btn" onClick={() => onLockedFeature('选择 WPS 文档')}>
              选择文档
            </button>
          </article>
          <article className="tsw-reqTestCreateCard">
            <strong>手动创建</strong>
            <p className="tsw-muted">空白创建测试方案并在线编辑</p>
            <button type="button" className="tsw-btn" onClick={() => onLockedFeature('新建方案')}>
              新建方案
            </button>
          </article>
        </div>
      ) : null}

      <article className="tsw-reqTestPlanSummary">
        <div className="tsw-reqTestPlanSummaryHead">
          <div>
            <strong>{requirement.title}测试方案</strong>
            <div className="tsw-reqDocTags">
              <span className="tsw-reqDocTag" data-tone="info">WPS 在线文档</span>
              <span className="tsw-tag" data-tone="warn">待确认</span>
            </div>
          </div>
          <dl className="tsw-reqTestPlanMeta">
            <div><dt>负责人</dt><dd>{testerName}</dd></div>
            <div><dt>更新时间</dt><dd>2025-05-22 15:30</dd></div>
          </dl>
        </div>
        <div className="tsw-reqTestPlanDetailGrid">
          <div>
            <span className="tsw-muted">测试范围</span>
            <p>覆盖主功能场景与关键业务流程</p>
          </div>
          <div>
            <span className="tsw-muted">功能用例</span>
            <p>28</p>
          </div>
          <div>
            <span className="tsw-muted">测试环境</span>
            <p>预发（Windows 10 / Chrome 120）</p>
          </div>
          <div>
            <span className="tsw-muted">异常用例</span>
            <p>6</p>
          </div>
        </div>
        <div className="tsw-reqTestPlanFooter">
          <button type="button" className="tsw-btn" onClick={() => onLockedFeature('打开文档')}>
            打开文档
          </button>
          {canEdit ? (
            <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onConfirm}>
              确认方案
            </button>
          ) : null}
        </div>
      </article>
    </section>
  );
}

function CasesStep({
  canEdit,
  onConfirm,
  onLockedFeature,
}: {
  canEdit: boolean;
  onConfirm: () => void;
  onLockedFeature: (label: string) => void;
}) {
  return (
    <section className="tsw-card tsw-reqDetailSection">
      <div className="tsw-reqSectionHead">
        <h3 className="tsw-reqSectionTitle">测试用例</h3>
        {canEdit ? (
          <div className="tsw-reqSectionActions">
            <button type="button" className="tsw-btn" disabled title="暂未开放">
              AI 生成用例
            </button>
            <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={() => onLockedFeature('手动添加用例')}>
              手动添加
            </button>
            <button type="button" className="tsw-btn" onClick={() => onLockedFeature('批量导入用例')}>
              批量导入
            </button>
          </div>
        ) : null}
      </div>

      <div className="tsw-reqTestToolbar">
        <input className="tsw-input" placeholder="搜索用例编号或名称" disabled={!canEdit} />
        <select className="tsw-input tsw-reqTestTypeSelect" disabled={!canEdit} defaultValue="all">
          <option value="all">全部类型</option>
          <option value="func">功能</option>
          <option value="ex">异常</option>
        </select>
      </div>

      <div className="tsw-reqDocTableWrap">
        <table className="tsw-reqDocTable">
          <thead>
            <tr>
              {canEdit ? <th /> : null}
              <th>用例编号</th>
              <th>用例名称</th>
              <th>类型</th>
              <th>优先级</th>
              <th>执行人</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_CASES.map((item) => (
              <tr key={item.id}>
                {canEdit ? <td><input type="checkbox" /></td> : null}
                <td>{item.id}</td>
                <td><strong>{item.name}</strong></td>
                <td>{item.type}</td>
                <td data-priority={item.priority}>{item.priority}</td>
                <td>{item.assignee}</td>
                <td>
                  <span className={`tsw-tag${item.status === '已确认' ? ' tsw-tagSuccess' : ''}`}>
                    {item.status}
                  </span>
                </td>
                <td>
                  <button type="button" className="tsw-linkBtn" onClick={() => onLockedFeature(`查看 ${item.id}`)}>
                    查看
                  </button>
                  {canEdit ? (
                    <button type="button" className="tsw-linkBtn" onClick={() => onLockedFeature(`修改 ${item.id}`)}>
                      修改
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="tsw-reqTestPlanFooter">
          <button type="button" className="tsw-btn" onClick={() => onLockedFeature('分配执行人')}>
            分配执行人
          </button>
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onConfirm}>
            确认用例并进入执行
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ExecuteStep({
  canEdit,
  onConfirm,
  onLockedFeature,
}: {
  canEdit: boolean;
  onConfirm: () => void;
  onLockedFeature: (label: string) => void;
}) {
  return (
    <section className="tsw-card tsw-reqDetailSection">
      <h3 className="tsw-reqSectionTitle">执行测试</h3>
      <div className="tsw-reqTestStatRow">
        <article className="tsw-reqTestStatCard"><span>待执行</span><strong>4</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="success"><span>通过</span><strong>12</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="danger"><span>失败</span><strong>1</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="warn"><span>阻塞</span><strong>1</strong></article>
      </div>
      <p className="tsw-muted tsw-reqDevAssignHint">
        {canEdit
          ? '按用例执行并记录结果。Demo 可直接进入缺陷复测。'
          : '测试执行中，当前为只读结果预览。'}
      </p>
      <ul className="tsw-reqTestContentList">
        {DEMO_CASES.map((item) => (
          <li key={item.id}>
            <span>{item.id} · {item.name}</span>
            <button type="button" className="tsw-linkBtn" onClick={() => onLockedFeature(`执行 ${item.id}`)}>
              {canEdit ? '记录结果' : '查看结果'}
            </button>
          </li>
        ))}
      </ul>
      {canEdit ? (
        <div className="tsw-reqTestPlanFooter">
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onConfirm}>
            完成本轮执行
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RetestStep({
  requirement,
  canEdit,
  onConfirm,
  onRequirementUpdated,
  onLockedFeature,
}: {
  requirement: Requirement;
  canEdit: boolean;
  onConfirm: () => void;
  onRequirementUpdated: (requirement: Requirement) => void;
  onLockedFeature: (label: string) => void;
}) {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.listRequirementBugs(requirement.id)
      .then((response) => {
        if (cancelled) return;
        setBugs(response.items);
        const retestable = response.items.find((bug) => bug.status.toUpperCase() === 'FIXED');
        setSelectedId((current) => current ?? retestable?.id ?? response.items[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setActionError(err instanceof Error ? err.message : '加载缺陷失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requirement.id, requirement.status_version]);

  const selected = bugs.find((bug) => bug.id === selectedId) ?? null;
  const fixedCount = bugs.filter((bug) => bug.status.toUpperCase() === 'FIXED').length;
  const closedCount = bugs.filter((bug) => ['VERIFIED', 'CLOSED'].includes(bug.status.toUpperCase())).length;
  const reopenedCount = bugs.filter((bug) => ['OPEN', 'IN_PROGRESS'].includes(bug.status.toUpperCase())).length;
  const allClosed = bugs.length > 0
    && bugs.every((bug) => ['VERIFIED', 'CLOSED'].includes(bug.status.toUpperCase()));

  const statusLabel = (status: string) => {
    switch (status.toUpperCase()) {
      case 'FIXED': return '待复测';
      case 'VERIFIED': return '复测通过';
      case 'CLOSED': return '已关闭';
      case 'IN_PROGRESS': return '重新修复中';
      case 'OPEN': return '待修复';
      default: return status;
    }
  };

  const handleSubmitRetest = async () => {
    if (!selected) return;
    setSubmitting(true);
    setActionError(null);
    setActionOk(null);
    try {
      const response = await api.submitBugRetest(selected.id, result, remark.trim());
      const nextBugs = bugs.map((bug) => (bug.id === response.bug.id ? response.bug : bug));
      setBugs(nextBugs);
      onRequirementUpdated(response.main_requirement);
      if (result === 'PASS') {
        setActionOk(`${response.bug.bug_code} 回归通过，Bug 已关闭，关联 Bug 需求已同步验证完成。`);
        const nextRetestable = nextBugs.find((bug) => bug.status.toUpperCase() === 'FIXED');
        setSelectedId(nextRetestable?.id ?? response.bug.id);
        if (nextBugs.every((bug) => ['VERIFIED', 'CLOSED'].includes(bug.status.toUpperCase()))) {
          onConfirm();
        }
      } else {
        setActionOk(`${response.bug.bug_code} 回归未通过，已重新进入修复中。`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '提交复测结果失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <h3 className="tsw-reqSectionTitle">缺陷复测</h3>
      <div className="tsw-reqTestStatRow">
        <article className="tsw-reqTestStatCard" data-tone="info"><span>待复测</span><strong>{fixedCount}</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="success"><span>已关闭</span><strong>{closedCount}</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="danger"><span>重新修复</span><strong>{reopenedCount}</strong></article>
      </div>

      {loading ? <p className="tsw-muted">加载缺陷中…</p> : null}
      {actionError ? <p className="tsw-error">{actionError}</p> : null}
      {actionOk ? <p className="tsw-success">{actionOk}</p> : null}

      {!loading && bugs.length === 0 ? (
        <div className="tsw-emptyState tsw-emptyStateInline">
          <p className="tsw-muted">当前需求没有待复测的关联 Bug。</p>
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onConfirm}>
            进入结果汇总
          </button>
        </div>
      ) : null}

      {!loading && bugs.length > 0 ? (
      <>
      <div className="tsw-reqTestRetestLayout">
        <div>
          <div className="tsw-reqDocTableWrap">
            <table className="tsw-reqDocTable">
              <thead>
                <tr>
                  <th>缺陷编号</th>
                  <th>标题</th>
                  <th>严重程度</th>
                  <th>环境</th>
                  <th>状态</th>
                  {canEdit ? <th>操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {bugs.map((item) => (
                  <tr
                    key={item.id}
                    data-selected={item.id === selectedId ? 'true' : 'false'}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td>{item.bug_code}</td>
                    <td><strong>{item.title}</strong></td>
                    <td>{item.severity}</td>
                    <td>{item.environment}</td>
                    <td>{statusLabel(item.status)}</td>
                    {canEdit ? (
                      <td>
                        <button
                          type="button"
                          className="tsw-linkBtn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(item.id);
                          }}
                        >
                          {item.status.toUpperCase() === 'FIXED' ? '开始复测' : '查看'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected ? (
            <article className="tsw-reqTestDefectDetail">
              <h4>{selected.bug_code} · {selected.title}</h4>
              <p><strong>问题描述：</strong>{selected.description}</p>
              <p><strong>复现步骤：</strong>{selected.steps_to_reproduce}</p>
              <p><strong>当前状态：</strong>{statusLabel(selected.status)}</p>
              <button type="button" className="tsw-linkBtn" onClick={() => onLockedFeature('查看修复证据')}>
                查看修复证据 →
              </button>
            </article>
          ) : null}
        </div>

        {canEdit && selected?.status.toUpperCase() === 'FIXED' ? (
          <aside className="tsw-reqTestRetestForm">
            <h4>提交复测结果</h4>
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="retest"
                checked={result === 'PASS'}
                onChange={() => setResult('PASS')}
              />
              复测通过
            </label>
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="retest"
                checked={result === 'FAIL'}
                onChange={() => setResult('FAIL')}
              />
              仍未通过
            </label>
            <textarea
              className="tsw-input"
              rows={4}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="复测说明（可选）"
            />
            <button type="button" className="tsw-btn" onClick={() => onLockedFeature('上传复测证据')}>
              上传复测证据
            </button>
            <button
              type="button"
              className="tsw-btn tsw-btnPrimary tsw-btnSolid"
              disabled={submitting}
              onClick={() => void handleSubmitRetest()}
            >
              {submitting ? '提交中…' : '提交复测结果'}
            </button>
            <p className="tsw-muted tsw-reqAsideHint">
              通过后 Bug 自动关闭，关联 Bug 需求同步验证完成；未通过则 Bug 和修复需求重新进入修复中。
            </p>
          </aside>
        ) : null}
      </div>
      {allClosed ? (
        <div className="tsw-reqTestPlanFooter">
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onConfirm}>
            全部复测通过，进入结果汇总
          </button>
        </div>
      ) : null}
      </>
      ) : null}
    </section>
  );
}

function SummaryStep({
  canEdit,
  requirement,
  members,
  frontendUserId,
  backendUserId,
  currentUserId,
  onRequirementUpdated,
  onLockedFeature,
}: {
  canEdit: boolean;
  requirement: Requirement;
  members: ProjectMember[];
  frontendUserId?: number;
  backendUserId?: number;
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
  onLockedFeature: (label: string) => void;
}) {
  const [conclusion, setConclusion] = useState<'PASS' | 'CONDITIONAL' | 'FAIL'>('PASS');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const [bugTitle, setBugTitle] = useState('');
  const [bugAssigneeIds, setBugAssigneeIds] = useState<number[]>(() => {
    const defaultId = backendUserId ?? requirement.backend_developer_user_id;
    return defaultId ? [defaultId] : [];
  });
  const [bugSeverity, setBugSeverity] = useState('P0');
  const [bugDescription, setBugDescription] = useState('');
  const [linkFailedCases, setLinkFailedCases] = useState(true);
  const [attachEvidence, setAttachEvidence] = useState(true);
  const [notifyLead, setNotifyLead] = useState(true);

  const frontendMember = memberByUserId(members, frontendUserId ?? requirement.developer_user_id);
  const backendMember = memberByUserId(members, backendUserId ?? requirement.backend_developer_user_id);
  const bugAssigneeOptions = [frontendMember, backendMember]
    .filter((member): member is ProjectMember => member !== null)
    .filter((member, index, items) => items.findIndex((item) => item.user_id === member.user_id) === index);

  useEffect(() => {
    const defaultId = backendUserId ?? requirement.backend_developer_user_id;
    setBugAssigneeIds(defaultId ? [defaultId] : []);
  }, [requirement.id, requirement.backend_developer_user_id, backendUserId]);

  const toggleBugAssignee = (userId: number) => {
    setBugAssigneeIds((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId);
      if (current.length >= 2) return current;
      return [...current, userId];
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setActionError(null);
    setActionOk(null);
    try {
      if (conclusion === 'FAIL') {
        if (!bugAssigneeIds.length) {
          setActionError('请至少选择一名修复负责人');
          return;
        }
        const assigneeNames = bugAssigneeIds
          .map((id) => bugAssigneeOptions.find((member) => member.user_id === id))
          .filter((member): member is ProjectMember => Boolean(member))
          .map((member) => userDisplayName(member.user_name))
          .join('、');
        const title = bugTitle.trim() || '测试失败缺陷（Demo）';
        const description = [
          bugDescription.trim() || note.trim() || `测试结论：失败。修复负责人：${assigneeNames}。`,
          linkFailedCases ? '已自动关联失败用例（Demo）' : '',
          attachEvidence ? '已附带截图/日志（Demo）' : '',
          notifyLead ? '已通知研发负责人（Demo）' : '',
        ].filter(Boolean).join('\n');
        const result = await api.createBug(requirement.project_id, {
          requirement_id: requirement.id,
          title,
          description,
          severity: bugSeverity === 'P0' ? 'CRITICAL' : bugSeverity === 'P1' ? 'HIGH' : 'MEDIUM',
          assignee_user_id: bugAssigneeIds[0],
          secondary_assignee_user_id: bugAssigneeIds[1],
          environment: 'SIT',
          steps_to_reproduce: linkFailedCases ? '已自动关联失败用例（Demo）' : '见问题描述',
        });
        onRequirementUpdated(result.main_requirement);
        setActionOk(
          `已创建 ${result.bug.bug_code}，并生成修复需求 ${result.fix_requirement.requirement_code}；负责人：${assigneeNames}。`,
        );
        return;
      }

      const summary = note.trim()
        || (conclusion === 'CONDITIONAL'
          ? 'Demo：有条件通过，存在低风险遗留项。'
          : 'Demo：测试通过，覆盖率 100%，建议进入待验收。');
      const updated = await completeTestingPhase(requirement, currentUserId, 'PASS', summary);
      onRequirementUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = conclusion === 'FAIL'
    ? '提交结论并创建 Bug'
    : '提交测试结论并进入待验收';

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <h3 className="tsw-reqSectionTitle">结果汇总</h3>
      <div className="tsw-reqTestStatRow">
        <article className="tsw-reqTestStatCard"><span>用例</span><strong>18</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="success"><span>通过</span><strong>16</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="danger"><span>失败</span><strong>1</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="warn"><span>阻塞</span><strong>1</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="info"><span>缺陷</span><strong>3</strong></article>
      </div>

      <div className="tsw-reqTestSummaryGrid">
        <article className="tsw-reqTestRingCard">
          <div className="tsw-reqTestProgressRing" aria-label="执行率 100%"><strong>100%</strong></div>
          <span>执行率</span>
        </article>
        <article className="tsw-reqTestRingCard">
          <div className="tsw-reqTestProgressRing tsw-reqTestProgressRingPass" aria-label="通过率 89%"><strong>89%</strong></div>
          <span>通过率</span>
        </article>
        <article className="tsw-reqTestConclusionBox">
          <h4>测试结论摘要</h4>
          <p className="tsw-muted">
            覆盖率 100%，未关闭问题 3 个（含阻塞 1）。可通过进入待验收，或判定失败并创建 Bug 进入复测。
          </p>
          <div className="tsw-reqTestPlanFooter">
            <button type="button" className="tsw-btn" onClick={() => onLockedFeature('查看详细结果')}>
              查看详细结果
            </button>
            <button type="button" className="tsw-btn" onClick={() => onLockedFeature('导出测试报告')}>
              导出测试报告
            </button>
          </div>
        </article>
      </div>

      {canEdit ? (
        <div className="tsw-reqTestSubmitPanel">
          <h4>测试负责人最终结论（仅测试负责人可操作）</h4>
          <div className="tsw-reqTestRadioGroup">
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="conclusion"
                checked={conclusion === 'PASS'}
                onChange={() => setConclusion('PASS')}
              />
              测试通过
            </label>
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="conclusion"
                checked={conclusion === 'CONDITIONAL'}
                onChange={() => setConclusion('CONDITIONAL')}
              />
              有条件通过
            </label>
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="conclusion"
                checked={conclusion === 'FAIL'}
                onChange={() => setConclusion('FAIL')}
              />
              测试失败
            </label>
          </div>

          {conclusion !== 'FAIL' ? (
            <textarea
              className="tsw-input"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="结论说明（判断依据与风险，可选；Demo 可不填直接提交）"
              maxLength={500}
            />
          ) : (
            <div className="tsw-reqTestBugForm">
              <div className="tsw-reqTestBugAssigneePicker">
                <span className="tsw-muted">修复负责人（可选择 1–2 人）</span>
                <div className="tsw-reqTestBugAssigneeGrid">
                  {bugAssigneeOptions.map((member) => {
                    const selected = bugAssigneeIds.includes(member.user_id);
                    const name = userDisplayName(member.user_name);
                    const role = member.user_id === frontendMember?.user_id ? '前端研发' : '后端研发';
                    return (
                      <button
                        key={member.user_id}
                        type="button"
                        className="tsw-reqTestBugAssignee"
                        data-active={selected ? 'true' : 'false'}
                        aria-pressed={selected}
                        onClick={() => toggleBugAssignee(member.user_id)}
                      >
                        <span
                          className="tsw-userAvatar"
                          style={{ background: userAvatarColor(name) }}
                          aria-hidden="true"
                        >
                          {userAvatarLetter(name)}
                        </span>
                        <span>
                          <strong>{name}</strong>
                          <small>{role}</small>
                        </span>
                        <i aria-hidden="true">{selected ? '✓' : '+'}</i>
                      </button>
                    );
                  })}
                </div>
                <small className="tsw-muted">
                  单端问题选择一人；涉及前后端时同时选择两人。
                </small>
              </div>

              <label className="tsw-fieldLabel">
                Bug 标题
                <input
                  className="tsw-input"
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="例如：退款超时场景失败"
                />
              </label>

              <div className="tsw-reqTestBugMetaRow">
                <label className="tsw-fieldLabel">
                  严重级别
                  <select
                    className="tsw-input"
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value)}
                  >
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                  </select>
                </label>
              </div>

              <label className="tsw-fieldLabel">
                问题描述
                <textarea
                  className="tsw-input"
                  rows={4}
                  value={bugDescription}
                  onChange={(e) => setBugDescription(e.target.value)}
                  placeholder="描述失败现象、复现步骤与影响面（可选）"
                  maxLength={500}
                />
              </label>

              <div className="tsw-reqTestBugChecks">
                <label className="tsw-reqTestRadio">
                  <input
                    type="checkbox"
                    checked={linkFailedCases}
                    onChange={(e) => setLinkFailedCases(e.target.checked)}
                  />
                  自动关联失败用例
                </label>
                <label className="tsw-reqTestRadio">
                  <input
                    type="checkbox"
                    checked={attachEvidence}
                    onChange={(e) => setAttachEvidence(e.target.checked)}
                  />
                  自动附带截图/日志
                </label>
                <label className="tsw-reqTestRadio">
                  <input
                    type="checkbox"
                    checked={notifyLead}
                    onChange={(e) => setNotifyLead(e.target.checked)}
                  />
                  通知研发负责人
                </label>
              </div>

              <div className="tsw-reqTestFailBanner">
                创建 Bug 后主需求进入 Bug 修复中；修复完成后由测试负责人复测。
              </div>
            </div>
          )}

          {actionError ? <p className="tsw-error">{actionError}</p> : null}
          {actionOk ? <p className="tsw-reqTestOkMsg">{actionOk}</p> : null}
          <button
            type="button"
            className="tsw-btn tsw-btnPrimary tsw-btnSolid"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '提交中…' : submitLabel}
          </button>
          <p className="tsw-muted tsw-reqAsideHint">
            Demo：可直接提交通过，或创建 Bug 后进入复测。仅测试负责人可操作。
          </p>
        </div>
      ) : (
        <p className="tsw-muted tsw-reqDevAssignHint">
          当前为只读结果视图。仅测试负责人可提交最终结论或创建 Bug。
        </p>
      )}
    </section>
  );
}

function TesterAsideByStep({
  step,
  testerName,
}: {
  step: TestWorkflowStep;
  testerName: string;
}) {
  const permissionText: Record<TestWorkflowStep, string> = {
    plan: '可引入、创建并确认测试方案。',
    cases: '可添加、导入、分配和确认用例。',
    execute: '可执行用例并记录结果。',
    retest: '可复测缺陷并提交复测结论。',
    summary: '仅测试负责人可提交最终结论并推进状态。',
  };

  return (
    <>
      <div className="tsw-card tsw-reqAsideCard">
        <h4 className="tsw-reqAsideTitle">测试负责人</h4>
        <div className="tsw-reqAsidePerson">
          <span className="tsw-userAvatar" style={{ background: userAvatarColor(testerName) }} aria-hidden="true">
            {userAvatarLetter(testerName)}
          </span>
          <div className="tsw-reqAsidePersonMeta">
            <strong>{testerName}</strong>
            <span className="tsw-reqRoleTag">测试负责人</span>
          </div>
        </div>
      </div>

      {step === 'cases' ? (
        <div className="tsw-card tsw-reqAsideCard">
          <h4 className="tsw-reqAsideTitle">用例统计</h4>
          <p className="tsw-reqTestAsideStat">共 <strong>18</strong> 条</p>
          <div className="tsw-reqTestAsideSplit">
            <div><span className="tsw-muted">已确认</span><strong className="tsw-reqTestNumSuccess">12</strong></div>
            <div><span className="tsw-muted">待确认</span><strong className="tsw-reqTestNumWarn">6</strong></div>
          </div>
        </div>
      ) : null}

      {step === 'plan' ? (
        <div className="tsw-card tsw-reqAsideCard">
          <h4 className="tsw-reqAsideTitle">关联资料</h4>
          <ul className="tsw-reqDevLinkList">
            <li><span>产品需求文档</span></li>
            <li><span>接口约定</span></li>
            <li><span>研发交付说明</span></li>
          </ul>
        </div>
      ) : null}

      {step === 'retest' ? (
        <div className="tsw-card tsw-reqAsideCard">
          <h4 className="tsw-reqAsideTitle">复测环境</h4>
          <span className="tsw-tag">SIT</span>
        </div>
      ) : null}

      {step === 'summary' ? (
        <div className="tsw-card tsw-reqAsideCard">
          <h4 className="tsw-reqAsideTitle">报告证据</h4>
          <ul className="tsw-reqDevLinkList">
            <li><span>18 条用例结果</span></li>
            <li><span>3 条缺陷记录</span></li>
            <li><span>测试方案</span></li>
          </ul>
        </div>
      ) : null}

      <div className="tsw-card tsw-reqAsideCard">
        <h4 className="tsw-reqAsideTitle">当前权限</h4>
        <p className="tsw-muted tsw-reqAsideHint">{permissionText[step]}</p>
      </div>
    </>
  );
}

function NonTesterAside({ testerName }: { testerName: string }) {
  return (
    <div className="tsw-card tsw-reqAsideCard">
      <h4 className="tsw-reqAsideTitle">测试负责人</h4>
      <div className="tsw-reqAsidePerson">
        <span className="tsw-userAvatar" style={{ background: userAvatarColor(testerName) }} aria-hidden="true">
          {userAvatarLetter(testerName)}
        </span>
        <div className="tsw-reqAsidePersonMeta">
          <strong>{testerName}</strong>
          <span className="tsw-reqRoleTag">测试负责人</span>
        </div>
      </div>
    </div>
  );
}

export function RequirementTestPhaseMain({
  requirement,
  members,
  frontendUserId,
  backendUserId,
  currentUserId,
  onRequirementUpdated,
  onLockedFeature,
}: Props) {
  const viewContext = useTestPhaseViewContext(
    requirement,
    members,
    currentUserId,
    frontendUserId,
    backendUserId,
  );
  const { activeStep, setActiveStep, goNext, isTester } = useTestWorkflow();
  const effectiveTester = isTester || viewContext.role === 'tester';

  const tester = memberByUserId(members, requirement.tester_user_id);
  const testerName = tester ? userDisplayName(tester.user_name) : '未指定';

  if (!effectiveTester) {
    return <NonTesterTestProgress requirement={requirement} />;
  }

  return (
    <div className="tsw-reqTestLayout">
      <WorkflowNav activeStep={activeStep} onSelect={setActiveStep} />
      <div className="tsw-reqTestMainPane">
        {activeStep === 'plan' ? (
          <PlanStep
            requirement={requirement}
            testerName={testerName}
            canEdit
            onConfirm={() => goNext('plan')}
            onLockedFeature={onLockedFeature}
          />
        ) : null}
        {activeStep === 'cases' ? (
          <CasesStep canEdit onConfirm={() => goNext('cases')} onLockedFeature={onLockedFeature} />
        ) : null}
        {activeStep === 'execute' ? (
          <ExecuteStep canEdit onConfirm={() => goNext('execute')} onLockedFeature={onLockedFeature} />
        ) : null}
        {activeStep === 'retest' ? (
          <RetestStep
            requirement={requirement}
            canEdit
            onConfirm={() => goNext('retest')}
            onRequirementUpdated={onRequirementUpdated}
            onLockedFeature={onLockedFeature}
          />
        ) : null}
        {activeStep === 'summary' ? (
          <SummaryStep
            canEdit
            requirement={requirement}
            members={members}
            frontendUserId={frontendUserId}
            backendUserId={backendUserId}
            currentUserId={currentUserId}
            onRequirementUpdated={onRequirementUpdated}
            onLockedFeature={onLockedFeature}
          />
        ) : null}
      </div>
    </div>
  );
}

export function RequirementTestPhaseAside(props: Props) {
  const {
    requirement,
    members,
    frontendUserId,
    backendUserId,
    currentUserId,
  } = props;

  const viewContext = useTestPhaseViewContext(
    requirement,
    members,
    currentUserId,
    frontendUserId,
    backendUserId,
  );
  const { activeStep, isTester } = useTestWorkflow();
  const tester = memberByUserId(members, requirement.tester_user_id);
  const testerName = tester ? userDisplayName(tester.user_name) : '未指定';

  if (viewContext.role !== 'tester' && !isTester) {
    return <NonTesterAside testerName={testerName} />;
  }

  return <TesterAsideByStep step={activeStep} testerName={testerName} />;
}
