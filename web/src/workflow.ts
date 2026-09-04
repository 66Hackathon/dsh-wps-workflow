/** 创建项目向导步骤（项目空间入口） */
export type CreateProjectStepId =
  | 'basic-info'
  | 'members'
  | 'repository'
  | 'group';

export interface CreateProjectStepDef {
  id: CreateProjectStepId;
  title: string;
}

export const CREATE_PROJECT_STEPS: CreateProjectStepDef[] = [
  { id: 'basic-info', title: '基本信息' },
  { id: 'members', title: '项目成员' },
  { id: 'repository', title: '代码仓库' },
  { id: 'group', title: '项目群' },
];

/** 创建需求向导步骤 */
export type CreateRequirementStepId = 'info' | 'owner' | 'document';

export interface CreateRequirementStepDef {
  id: CreateRequirementStepId;
  title: string;
}

export const CREATE_REQUIREMENT_STEPS: CreateRequirementStepDef[] = [
  { id: 'info', title: '需求信息' },
  { id: 'owner', title: '负责人' },
  { id: 'document', title: '需求文档' },
];

/** TeamSpace 协作流程（Demo：按步骤串联，逐步开放能力） */
export type WorkflowStepId =
  | 'create-project'
  | 'add-members'
  | 'create-requirement'
  | 'create-group'
  | 'requirement-flow'
  | 'ai-session';

export type WorkflowStepStatus = 'completed' | 'current' | 'upcoming' | 'locked';

export interface WorkflowStepDef {
  id: WorkflowStepId;
  title: string;
  summary: string;
  /** Demo 说明：与正式版的差异 */
  demoNote: string;
}

export const WORKFLOW_STEPS: WorkflowStepDef[] = [
  {
    id: 'create-project',
    title: '创建项目',
    summary: '在项目空间新建协作项目，作为需求与成员的组织单元。',
    demoNote: 'Demo 已打通：填写表单即可调用后端 API 创建项目。',
  },
  {
    id: 'add-members',
    title: '添加成员',
    summary: '为项目配置产品、研发、测试等角色成员。',
    demoNote: 'Demo 已打通：从系统用户列表选择成员并分配角色（非 WPS 通讯录）。',
  },
  {
    id: 'create-requirement',
    title: '创建需求',
    summary: '录入需求标题与描述，进入产品编辑状态。',
    demoNote: 'Demo 已打通：三步向导创建需求，创建者为产品，并指定研发与测试负责人。',
  },
  {
    id: 'create-group',
    title: '创建项目群',
    summary: '在 WPS 协作中创建项目群，关联 IM 沟通渠道。',
    demoNote: 'Demo 暂未开放。正式版将调用 WPS IM 创建群聊。',
  },
  {
    id: 'requirement-flow',
    title: '需求流转',
    summary: '产品评审 → 研发 → 测试 → 完成，记录状态变更。',
    demoNote: 'Demo 暂未开放。可在项目内查看演示需求的只读列表。',
  },
  {
    id: 'ai-session',
    title: 'AI 协作会话',
    summary: '在项目/需求上下文中与 Agent 对话，辅助编写与评审。',
    demoNote: 'Demo 暂未开放。会话 Tab 仅展示种子数据与 stub 回复。',
  },
];

export function resolveStepStatuses(
  activeIndex: number,
  projectCount: number,
): WorkflowStepStatus[] {
  return WORKFLOW_STEPS.map((_, index) => {
    if (index === 0 && projectCount > 0) return 'completed';
    if (index < activeIndex) return 'completed';
    if (index === activeIndex) return 'current';
    if (index === activeIndex + 1) return 'upcoming';
    return 'locked';
  });
}
