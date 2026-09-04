import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { userAvatarColor, userAvatarLetter, userDisplayName } from '../memberRoles';
import type { TestPhaseViewContext } from '../testPhaseRole';
import { resolveTestPhaseView } from '../testPhaseRole';
import type { ProjectMember, Requirement } from '../types';
import { REQUIREMENT_PHASE_BADGE } from '../requirementPhase';

interface Props {
  requirement: Requirement;
  members: ProjectMember[];
  frontendUserId?: number;
  backendUserId?: number;
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
  onLockedFeature: (label: string) => void;
}

type TestWorkflowStep = 'content' | 'cases' | 'result';
type StepState = 'completed' | 'current' | 'upcoming';

interface MockTestCase {
  id: string;
  name: string;
  type: string;
  priority: string;
  status: '待执行' | '通过' | '失败';
}

interface TestWorkflowContextValue {
  activeStep: TestWorkflowStep;
  setActiveStep: (step: TestWorkflowStep) => void;
  goNext: (from: TestWorkflowStep) => void;
  isTester: boolean;
  cases: MockTestCase[];
  addCase: (item: Omit<MockTestCase, 'id' | 'status'>) => void;
  removeCase: (id: string) => void;
  setCaseStatus: (id: string, status: MockTestCase['status']) => void;
}

const TestWorkflowContext = createContext<TestWorkflowContextValue | null>(null);

function useTestWorkflow() {
  const ctx = useContext(TestWorkflowContext);
  if (!ctx) {
    return {
      activeStep: 'result' as TestWorkflowStep,
      setActiveStep: () => undefined,
      goNext: () => undefined,
      isTester: false,
      cases: [] as MockTestCase[],
      addCase: () => undefined,
      removeCase: () => undefined,
      setCaseStatus: () => undefined,
    };
  }
  return ctx;
}

const WORKFLOW_STEPS: { id: TestWorkflowStep; label: string }[] = [
  { id: 'content', label: '测试内容' },
  { id: 'cases', label: '测试用例' },
  { id: 'result', label: '测试结果' },
];

const INITIAL_CASES: MockTestCase[] = [
  { id: 'TC-001', name: '主流程冒烟验证', type: '功能', priority: 'P0', status: '待执行' },
  { id: 'TC-002', name: '异常输入提示', type: '异常', priority: 'P1', status: '待执行' },
];

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

export function TestPhaseProvider({
  isTester,
  children,
}: {
  isTester: boolean;
  children: ReactNode;
}) {
  const [activeStep, setActiveStep] = useState<TestWorkflowStep>(isTester ? 'content' : 'result');
  const [cases, setCases] = useState<MockTestCase[]>(INITIAL_CASES);

  const goNext = (from: TestWorkflowStep) => {
    const index = WORKFLOW_STEPS.findIndex((s) => s.id === from);
    const next = WORKFLOW_STEPS[index + 1];
    if (!next) return;
    setActiveStep(next.id);
  };

  const addCase = (item: Omit<MockTestCase, 'id' | 'status'>) => {
    setCases((prev) => {
      const seq = String(prev.length + 1).padStart(3, '0');
      return [...prev, { ...item, id: `TC-${seq}`, status: '待执行' }];
    });
  };

  const removeCase = (id: string) => {
    setCases((prev) => prev.filter((item) => item.id !== id));
  };

  const setCaseStatus = (id: string, status: MockTestCase['status']) => {
    setCases((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const value = useMemo(
    () => ({
      activeStep,
      setActiveStep,
      goNext,
      isTester,
      cases,
      addCase,
      removeCase,
      setCaseStatus,
    }),
    [activeStep, isTester, cases],
  );

  return (
    <TestWorkflowContext.Provider value={value}>
      {children}
    </TestWorkflowContext.Provider>
  );
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

function ContentStep({
  requirement,
  canEdit,
  onContinue,
  onSkipToResult,
}: {
  requirement: Requirement;
  canEdit: boolean;
  onContinue: () => void;
  onSkipToResult: () => void;
}) {
  return (
    <section className="tsw-card tsw-reqDetailSection">
      <h3 className="tsw-reqSectionTitle">测试内容</h3>
      <p className="tsw-muted tsw-reqDevAssignHint">
        确认本次要测的内容后，可准备用例，或直接进入结果提交。
      </p>

      <dl className="tsw-reqHistoryFields">
        <div className="tsw-reqHistoryField">
          <dt>需求标题</dt>
          <dd>{requirement.title}</dd>
        </div>
        <div className="tsw-reqHistoryField">
          <dt>需求描述</dt>
          <dd className="tsw-reqViewDesc">{requirement.description?.trim() || '暂无描述'}</dd>
        </div>
        <div className="tsw-reqHistoryField">
          <dt>优先级</dt>
          <dd>{requirement.priority}</dd>
        </div>
      </dl>

      {canEdit ? (
        <div className="tsw-reqTestPlanFooter">
          <button type="button" className="tsw-btn" onClick={onSkipToResult}>
            直接进入测试
          </button>
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onContinue}>
            下一步：测试用例
          </button>
        </div>
      ) : null}
    </section>
  );
}

function CasesStep({
  canEdit,
  onContinue,
  onLockedFeature,
}: {
  canEdit: boolean;
  onContinue: () => void;
  onLockedFeature: (label: string) => void;
}) {
  const { cases, addCase, removeCase, setCaseStatus } = useTestWorkflow();
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState('功能');
  const [draftPriority, setDraftPriority] = useState('P1');
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    const name = draftName.trim();
    if (!name) return;
    addCase({ name, type: draftType, priority: draftPriority });
    setDraftName('');
    setShowAdd(false);
  };

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <div className="tsw-reqSectionHead">
        <h3 className="tsw-reqSectionTitle">测试用例</h3>
        {canEdit ? (
          <div className="tsw-reqSectionActions">
            <button
              type="button"
              className="tsw-btn"
              title="暂未开放"
              onClick={() => onLockedFeature('AI 生成测试用例')}
            >
              AI 生成用例
              <span className="tsw-tag tsw-tagMuted" style={{ marginLeft: 6 }}>暂未开放</span>
            </button>
            <button
              type="button"
              className="tsw-btn tsw-btnPrimary tsw-btnSolid"
              onClick={() => setShowAdd((open) => !open)}
            >
              手动添加
            </button>
          </div>
        ) : null}
      </div>

      <p className="tsw-muted tsw-reqDevAssignHint">
        用例为本地 Demo 数据，不接后端接口；可手动添加后进入结果提交。
      </p>

      {canEdit && showAdd ? (
        <div className="tsw-reqTestAddCaseForm">
          <input
            className="tsw-input"
            placeholder="用例名称，例如：登录成功跳转"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <select className="tsw-select" value={draftType} onChange={(e) => setDraftType(e.target.value)}>
            <option value="功能">功能</option>
            <option value="异常">异常</option>
            <option value="边界">边界</option>
          </select>
          <select className="tsw-select" value={draftPriority} onChange={(e) => setDraftPriority(e.target.value)}>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={handleAdd}>
            添加
          </button>
        </div>
      ) : null}

      <div className="tsw-reqDocTableWrap">
        <table className="tsw-reqDocTable">
          <thead>
            <tr>
              <th>编号</th>
              <th>用例名称</th>
              <th>类型</th>
              <th>优先级</th>
              <th>状态</th>
              {canEdit ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {cases.length ? cases.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td><strong>{item.name}</strong></td>
                <td>{item.type}</td>
                <td>{item.priority}</td>
                <td>
                  {canEdit ? (
                    <select
                      className="tsw-select tsw-reqTestCaseStatus"
                      value={item.status}
                      onChange={(e) => setCaseStatus(item.id, e.target.value as MockTestCase['status'])}
                    >
                      <option value="待执行">待执行</option>
                      <option value="通过">通过</option>
                      <option value="失败">失败</option>
                    </select>
                  ) : (
                    <span className="tsw-tag">{item.status}</span>
                  )}
                </td>
                {canEdit ? (
                  <td>
                    <button type="button" className="tsw-linkBtn" onClick={() => removeCase(item.id)}>
                      删除
                    </button>
                  </td>
                ) : null}
              </tr>
            )) : (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="tsw-muted">暂无用例，可手动添加或直接进入结果提交。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="tsw-reqTestPlanFooter">
          <button type="button" className="tsw-btn tsw-btnPrimary tsw-btnSolid" onClick={onContinue}>
            下一步：测试结果
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ResultStep({
  canEdit,
  requirement,
  currentUserId,
  onRequirementUpdated,
  onOpenRequirement,
}: {
  canEdit: boolean;
  requirement: Requirement;
  currentUserId?: number;
  onRequirementUpdated: (requirement: Requirement) => void;
  onOpenRequirement?: (requirementId: number) => void;
}) {
  const { cases } = useTestWorkflow();
  const [mode, setMode] = useState<'PASS' | 'FAIL' | 'BUG'>('PASS');
  const [note, setNote] = useState('');
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [linkedBugs, setLinkedBugs] = useState<Requirement[]>([]);
  const [bugsLoading, setBugsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBugsLoading(true);
    void api.listRequirementBugs(requirement.id).then(
      (res) => {
        if (!cancelled) setLinkedBugs(res.items ?? []);
      },
      () => {
        if (!cancelled) setLinkedBugs([]);
      },
    ).finally(() => {
      if (!cancelled) setBugsLoading(false);
    });
    return () => { cancelled = true; };
  }, [requirement.id, requirement.status_version]);

  const passed = cases.filter((item) => item.status === '通过').length;
  const failed = cases.filter((item) => item.status === '失败').length;
  const pending = cases.filter((item) => item.status === '待执行').length;

  const handleSubmit = async () => {
    if (!canEdit) return;
    setSubmitting(true);
    setActionError(null);
    setActionOk(null);
    try {
      const testerId = requirement.tester_user_id ?? currentUserId;
      const covered = cases.length
        ? cases.map((item) => `${item.id} ${item.name}(${item.status})`).join('；')
        : '未维护用例（直接提交）';

      if (mode === 'PASS') {
        const updated = await api.transitionRequirement(requirement.id, 'PRODUCT_ACCEPTANCE', {
          test_result: 'PASS',
          test_summary: note.trim() || '测试通过，进入产品验收。',
          test_cases_covered: covered,
          tester_user_id: testerId,
          remark: '测试通过',
        });
        onRequirementUpdated(updated);
        setActionOk('已提交测试通过，需求进入产品验收。');
        return;
      }

      if (mode === 'FAIL') {
        const reason = note.trim();
        if (!reason) {
          setActionError('请填写不通过原因');
          return;
        }
        const updated = await api.transitionRequirement(requirement.id, 'DEVELOPMENT', {
          test_result: 'FAIL',
          test_summary: reason,
          test_cases_covered: covered,
          tester_user_id: testerId,
          return_reason: reason,
          remark: '测试不通过，退回研发',
        });
        onRequirementUpdated(updated);
        setActionOk('已提交测试不通过，需求退回研发阶段。');
        return;
      }

      // 提交 Bug：新建 Bug 需求，主需求仍停留在测试中
      const title = bugTitle.trim();
      if (!title) {
        setActionError('请填写 Bug 标题');
        return;
      }
      const reason = bugDescription.trim() || note.trim() || `测试提交 Bug：${title}`;
      const code = `BUG-${requirement.requirement_code}-${Date.now().toString().slice(-4)}`;
      const result = await api.createRequirementBug(requirement.id, {
        requirement_code: code,
        title,
        description: reason,
        priority: requirement.priority || 'HIGH',
        triggered_at_stage: 'TESTING',
      });
      setLinkedBugs((prev) => [result.bug, ...prev.filter((item) => item.id !== result.bug.id)]);
      onRequirementUpdated(result.main_requirement);
      // 同步写入需求列表，便于在列表中找到该 Bug
      onRequirementUpdated(result.bug);
      setBugTitle('');
      setBugDescription('');
      setActionOk(`已新建 Bug 需求 ${result.bug.requirement_code}，可在需求列表或下方打开。主需求仍停留在测试中。`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="tsw-card tsw-reqDetailSection">
      <h3 className="tsw-reqSectionTitle">测试结果</h3>

      <div className="tsw-reqTestStatRow">
        <article className="tsw-reqTestStatCard"><span>用例</span><strong>{cases.length}</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="success"><span>通过</span><strong>{passed}</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="danger"><span>失败</span><strong>{failed}</strong></article>
        <article className="tsw-reqTestStatCard" data-tone="warn"><span>待执行</span><strong>{pending}</strong></article>
      </div>

      <div className="tsw-reqTestCreatedBugs">
        <h4>关联 Bug 需求</h4>
        {bugsLoading ? <p className="tsw-muted">加载中…</p> : null}
        {!bugsLoading && linkedBugs.length === 0 ? (
          <p className="tsw-muted">暂无关联 Bug。提交 Bug 后会在此显示，并出现在需求列表（类型：Bug）。</p>
        ) : null}
        {linkedBugs.length ? (
          <ul className="tsw-reqTestContentList">
            {linkedBugs.map((bug) => (
              <li key={bug.id}>
                <span>
                  {bug.requirement_code} · {bug.title}
                  <em className="tsw-muted" style={{ marginLeft: 8 }}>
                    {REQUIREMENT_PHASE_BADGE[bug.current_status] ?? bug.current_status}
                  </em>
                </span>
                {onOpenRequirement ? (
                  <button type="button" className="tsw-linkBtn" onClick={() => onOpenRequirement(bug.id)}>
                    打开
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {canEdit ? (
        <div className="tsw-reqTestSubmitPanel">
          <h4>提交测试结论</h4>
          <div className="tsw-reqTestRadioGroup">
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="test-result-mode"
                checked={mode === 'PASS'}
                onChange={() => setMode('PASS')}
              />
              通过
            </label>
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="test-result-mode"
                checked={mode === 'FAIL'}
                onChange={() => setMode('FAIL')}
              />
              不通过
            </label>
            <label className="tsw-reqTestRadio">
              <input
                type="radio"
                name="test-result-mode"
                checked={mode === 'BUG'}
                onChange={() => setMode('BUG')}
              />
              提交 Bug
            </label>
          </div>

          {mode === 'BUG' ? (
            <div className="tsw-reqTestBugForm">
              <label className="tsw-fieldLabel">
                Bug 标题 <span className="tsw-required">*</span>
                <input
                  className="tsw-input"
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="例如：退款超时未提示"
                />
              </label>
              <label className="tsw-fieldLabel">
                问题描述
                <textarea
                  className="tsw-input"
                  rows={3}
                  value={bugDescription}
                  onChange={(e) => setBugDescription(e.target.value)}
                  placeholder="复现步骤、期望与实际结果（可选）"
                />
              </label>
              <p className="tsw-muted tsw-reqAsideHint">
                提交 Bug 会新建独立的 Bug 需求进入研发，主需求仍停留在测试阶段。
              </p>
            </div>
          ) : (
            <textarea
              className="tsw-input"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === 'FAIL' ? '不通过原因（必填）' : '结论说明（可选）'}
            />
          )}

          {actionError ? <p className="tsw-error">{actionError}</p> : null}
          {actionOk ? <p className="tsw-success">{actionOk}</p> : null}

          <button
            type="button"
            className="tsw-btn tsw-btnPrimary tsw-btnSolid"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? '提交中…'
              : mode === 'PASS'
                ? '提交通过'
                : mode === 'FAIL'
                  ? '提交不通过'
                  : '新建 Bug 需求'}
          </button>
          <p className="tsw-muted tsw-reqAsideHint">
            通过 → 产品验收；不通过 → 退回研发；提交 Bug → 新建 Bug 需求（主需求不回滚）。
          </p>
        </div>
      ) : (
        <p className="tsw-muted tsw-reqDevAssignHint">
          当前为只读结果视图。仅测试负责人可提交结论。
        </p>
      )}
    </section>
  );
}

function NonTesterTestProgress({ requirement }: { requirement: Requirement }) {
  const states = stepStates(1);
  return (
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
              {states[index] === 'completed' ? '已完成' : states[index] === 'current' ? '进行中' : '待开始'}
            </span>
            {index < WORKFLOW_STEPS.length - 1 ? (
              <span className="tsw-reqDevStepLine" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="tsw-muted">需求「{requirement.title}」测试进行中，操作由测试负责人完成。</p>
    </section>
  );
}

function TesterAside({
  step,
  testerName,
  caseCount,
}: {
  step: TestWorkflowStep;
  testerName: string;
  caseCount: number;
}) {
  const hints: Record<TestWorkflowStep, string> = {
    content: '确认测试内容后进入用例，或直接进入结果提交。',
    cases: '可手动添加用例；AI 生成暂未开放。用例为本地 Mock。',
    result: '可通过进入产品验收；不通过退回研发；提交 Bug 新建 Bug 需求（主需求不回滚）。',
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
          <p className="tsw-reqTestAsideStat">共 <strong>{caseCount}</strong> 条</p>
        </div>
      ) : null}

      <div className="tsw-card tsw-reqAsideCard">
        <h4 className="tsw-reqAsideTitle">当前权限</h4>
        <p className="tsw-muted tsw-reqAsideHint">{hints[step]}</p>
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
  onOpenRequirement,
}: Props & { onOpenRequirement?: (requirementId: number) => void }) {
  const viewContext = useTestPhaseViewContext(
    requirement,
    members,
    currentUserId,
    frontendUserId,
    backendUserId,
  );
  const { activeStep, setActiveStep, goNext, isTester } = useTestWorkflow();
  const effectiveTester = isTester || viewContext.role === 'tester';

  if (!effectiveTester) {
    return <NonTesterTestProgress requirement={requirement} />;
  }

  return (
    <div className="tsw-reqTestLayout">
      <WorkflowNav activeStep={activeStep} onSelect={setActiveStep} />
      <div className="tsw-reqTestMainPane">
        {activeStep === 'content' ? (
          <ContentStep
            requirement={requirement}
            canEdit
            onContinue={() => goNext('content')}
            onSkipToResult={() => setActiveStep('result')}
          />
        ) : null}
        {activeStep === 'cases' ? (
          <CasesStep
            canEdit
            onContinue={() => goNext('cases')}
            onLockedFeature={onLockedFeature}
          />
        ) : null}
        {activeStep === 'result' ? (
          <ResultStep
            canEdit
            requirement={requirement}
            currentUserId={currentUserId}
            onRequirementUpdated={onRequirementUpdated}
            onOpenRequirement={onOpenRequirement}
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
  const { activeStep, isTester, cases } = useTestWorkflow();
  const tester = memberByUserId(members, requirement.tester_user_id);
  const testerName = tester ? userDisplayName(tester.user_name) : '未指定';

  if (viewContext.role !== 'tester' && !isTester) {
    return <NonTesterAside testerName={testerName} />;
  }

  return <TesterAside step={activeStep} testerName={testerName} caseCount={cases.length} />;
}
