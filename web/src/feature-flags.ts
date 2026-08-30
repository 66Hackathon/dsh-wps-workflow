/** 第一版功能开关：入口保留，点击后提示暂未开放（设计文档 §八）。 */
export const featureFlags = {
  aiGenerate: false,
  groupChat: false,
  robot: false,
  onlineDocument: false,
  gitlab: false,
  notification: false,
  documentVersion: false,
  aiContext: false,
  aiBugAnalysis: false,
  dshIntegration: false,
  wpsDocument: false,
  streamOutput: false,
} as const;

export const LOCKED_FEATURE_LABELS = [
  'AI 生成需求文档',
  '引入在线文档',
  '创建在线文档',
  '关联项目群',
  '添加机器人',
  '代码仓库',
  'AI 上下文',
  '消息通知',
  '文档版本',
  'AI Bug 分析',
  'DSH Agent 真实调用',
  'WPS 在线文档',
  'GitLab 集成',
] as const;

export type LockedFeatureLabel = (typeof LOCKED_FEATURE_LABELS)[number];
