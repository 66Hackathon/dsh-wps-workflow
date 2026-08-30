-- TeamSpace 权威全量建表脚本
-- 每次 make mysql-init 均 DROP + CREATE 完整表结构（不做增量 ALTER）
--
-- 设计原则：
-- 1. 状态流转前必须提交对应阶段的完整业务信息（requirement_stage_submissions）
-- 2. WPS 协作字段（群聊/云文档等）均可空，Demo 未开放时不强制填写
-- 3. 成员选择使用系统用户（users 表），非 WPS 通讯录
-- 4. 不使用数据库外键；删除时由应用在同一事务内按依赖顺序同步删除关联行

CREATE DATABASE IF NOT EXISTS teamspace
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE teamspace;

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS message_attachment;
DROP TABLE IF EXISTS conversation_message;
DROP TABLE IF EXISTS conversation;
DROP TABLE IF EXISTS bugs;
DROP TABLE IF EXISTS requirement_stage_submissions;
DROP TABLE IF EXISTS status_transition_rules;
DROP TABLE IF EXISTS status_change_log;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS project_setup_steps;
DROP TABLE IF EXISTS requirements;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;

SET FOREIGN_KEY_CHECKS = 1;

-- ── 组织与用户 ─────────────────────────────────────────────────────────────

CREATE TABLE organizations (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name                VARCHAR(128) NOT NULL,
    wps_tenant_id       VARCHAR(128) NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_organization_wps_tenant (wps_tenant_id),
    KEY idx_organization_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id                      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    organization_id         BIGINT UNSIGNED NOT NULL,

    wps_user_id             VARCHAR(128) NOT NULL,
    name                    VARCHAR(128) NOT NULL,
    nick_name               VARCHAR(128) NULL,
    avatar_url              VARCHAR(1000) NULL,
    company_name            VARCHAR(255) NULL,
    email                   VARCHAR(255) NULL,

    wps_access_token        TEXT NULL,
    wps_refresh_token       TEXT NULL,
    wps_token_expires_at    DATETIME(3) NULL,
    wps_refresh_expires_at  DATETIME(3) NULL,

    account_state           VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    first_login_at          DATETIME(3) NULL,
    last_login_at           DATETIME(3) NULL,
    created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE KEY uk_user_wps_id (wps_user_id),
    KEY idx_user_organization (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_sessions (
    id                  VARCHAR(64) PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    expires_at          DATETIME(3) NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_session_user (user_id),
    KEY idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 项目 ─────────────────────────────────────────────────────────────────────

CREATE TABLE projects (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    organization_id     BIGINT UNSIGNED NOT NULL,
    project_code        VARCHAR(64) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    description         TEXT NOT NULL,
    owner_user_id       BIGINT UNSIGNED NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    setup_status        VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    version             INT UNSIGNED NOT NULL DEFAULT 0,

    wps_group_id        VARCHAR(128) NULL,
    wps_group_name      VARCHAR(255) NULL,
    wps_doc_folder_id   VARCHAR(128) NULL,

    git_repo_url        VARCHAR(1000) NULL,
    git_default_branch  VARCHAR(128) NULL,

    created_by          BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    archived_at         DATETIME(3) NULL,

    UNIQUE KEY uk_project_code (organization_id, project_code),
    KEY idx_project_owner (owner_user_id),
    KEY idx_project_creator (created_by),
    KEY idx_project_status (organization_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_setup_steps (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    project_id          BIGINT UNSIGNED NOT NULL,
    step_code           VARCHAR(64) NOT NULL,
    completed           TINYINT(1) NOT NULL DEFAULT 0,
    wps_related         TINYINT(1) NOT NULL DEFAULT 0,
    completed_at        DATETIME(3) NULL,
    completed_by        BIGINT UNSIGNED NULL,
    note                VARCHAR(512) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_project_setup_step (project_id, step_code),
    KEY idx_setup_completed_by (completed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_members (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    project_id          BIGINT UNSIGNED NOT NULL,
    user_id             BIGINT UNSIGNED NOT NULL,
    role_code           VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
    role_codes          JSON NOT NULL,
    invited_by          BIGINT UNSIGNED NOT NULL,
    joined_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_project_member (project_id, user_id),
    KEY idx_member_user (user_id),
    KEY idx_member_inviter (invited_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 需求与状态流转 ───────────────────────────────────────────────────────────

CREATE TABLE requirements (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    project_id          BIGINT UNSIGNED NOT NULL,
    requirement_code    VARCHAR(64) NOT NULL,
    title               VARCHAR(255) NOT NULL,
    description         MEDIUMTEXT NOT NULL,
    priority            VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    development_scope   VARCHAR(32) NOT NULL,
    current_status      VARCHAR(64) NOT NULL DEFAULT 'PRODUCT_EDITING',
    status_version      INT UNSIGNED NOT NULL DEFAULT 0,
    planned_start_at    DATETIME(3) NULL,
    expected_at         DATETIME(3) NULL,

    product_owner_user_id   BIGINT UNSIGNED NULL,
    developer_user_id       BIGINT UNSIGNED NULL,
    backend_developer_user_id BIGINT UNSIGNED NULL,
    tester_user_id          BIGINT UNSIGNED NULL,

    parent_requirement_id   BIGINT UNSIGNED NULL,

    created_by          BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    archived_at         DATETIME(3) NULL,

    UNIQUE KEY uk_requirement_code (project_id, requirement_code),
    KEY idx_requirement_project_status (project_id, current_status),
    KEY idx_requirement_po (product_owner_user_id),
    KEY idx_requirement_dev (developer_user_id),
    KEY idx_requirement_backend_dev (backend_developer_user_id),
    KEY idx_requirement_tester (tester_user_id),
    KEY idx_requirement_creator (created_by),
    KEY idx_requirement_parent (parent_requirement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE requirement_stage_submissions (
    id                      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    requirement_id          BIGINT UNSIGNED NOT NULL,
    stage_code              VARCHAR(64) NOT NULL,

    spec_body               MEDIUMTEXT NULL,
    acceptance_criteria     MEDIUMTEXT NULL,
    product_owner_user_id   BIGINT UNSIGNED NULL,

    review_result           VARCHAR(16) NULL,
    review_comment          MEDIUMTEXT NULL,
    reviewer_user_id        BIGINT UNSIGNED NULL,

    dev_summary             MEDIUMTEXT NULL,
    implementation_notes    MEDIUMTEXT NULL,
    developer_user_id       BIGINT UNSIGNED NULL,

    test_summary            MEDIUMTEXT NULL,
    test_cases_covered      MEDIUMTEXT NULL,
    test_result             VARCHAR(16) NULL,
    tester_user_id          BIGINT UNSIGNED NULL,

    release_note            MEDIUMTEXT NULL,
    closed_by_user_id       BIGINT UNSIGNED NULL,

    operator_user_id        BIGINT UNSIGNED NOT NULL,
    submitted_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE KEY uk_requirement_stage (requirement_id, stage_code),
    KEY idx_stage_requirement (requirement_id),
    KEY idx_stage_operator (operator_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE status_transition_rules (
    id                  SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    resource_type       VARCHAR(32) NOT NULL DEFAULT 'REQUIREMENT',
    from_status         VARCHAR(64) NOT NULL,
    to_status           VARCHAR(64) NOT NULL,
    required_stage_code VARCHAR(64) NOT NULL,
    description         VARCHAR(255) NOT NULL,
    UNIQUE KEY uk_transition (resource_type, from_status, to_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE status_change_log (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    resource_type       VARCHAR(32) NOT NULL,
    resource_id         BIGINT UNSIGNED NOT NULL,
    from_status         VARCHAR(64) NULL,
    to_status           VARCHAR(64) NOT NULL,
    operator_user_id    BIGINT UNSIGNED NOT NULL,
    remark              VARCHAR(512) NOT NULL,
    stage_submission_id BIGINT UNSIGNED NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_status_log_resource (resource_type, resource_id),
    KEY idx_status_log_operator (operator_user_id),
    KEY idx_status_log_submission (stage_submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bug ──────────────────────────────────────────────────────────────────────

CREATE TABLE bugs (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    project_id          BIGINT UNSIGNED NOT NULL,
    requirement_id      BIGINT UNSIGNED NOT NULL,
    bug_code            VARCHAR(64) NOT NULL,
    title               VARCHAR(255) NOT NULL,
    description         MEDIUMTEXT NOT NULL,
    steps_to_reproduce  MEDIUMTEXT NOT NULL,
    environment         VARCHAR(128) NOT NULL,
    severity            VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    status              VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    found_in_status     VARCHAR(64) NOT NULL DEFAULT 'TESTING',
    reporter_user_id    BIGINT UNSIGNED NOT NULL,
    assignee_user_id    BIGINT UNSIGNED NULL,
    fix_requirement_id  BIGINT UNSIGNED NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_bug_code (project_id, bug_code),
    KEY idx_bug_project_status (project_id, status),
    KEY idx_bug_requirement (requirement_id),
    KEY idx_bug_reporter (reporter_user_id),
    KEY idx_bug_assignee (assignee_user_id),
    KEY idx_bug_fix_requirement (fix_requirement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 会话 ─────────────────────────────────────────────────────────────────────

CREATE TABLE conversation (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    project_id          BIGINT UNSIGNED NOT NULL,
    requirement_id      BIGINT UNSIGNED NULL,
    bug_id              BIGINT UNSIGNED NULL,
    creator_user_id     BIGINT UNSIGNED NOT NULL,
    title               VARCHAR(255) NOT NULL,
    conversation_type   VARCHAR(32) NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    wps_chat_id         VARCHAR(128) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_conversation_project (project_id, status),
    KEY idx_conversation_requirement (requirement_id),
    KEY idx_conversation_bug (bug_id),
    KEY idx_conversation_creator (creator_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversation_message (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    conversation_id     BIGINT UNSIGNED NOT NULL,
    role                VARCHAR(16) NOT NULL,
    content             MEDIUMTEXT NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    model_name          VARCHAR(100) NULL,
    error_message       TEXT NULL,
    created_by          BIGINT UNSIGNED NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_message_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_attachment (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    message_id          BIGINT UNSIGNED NOT NULL,
    resource_type       VARCHAR(32) NOT NULL,
    resource_id         BIGINT UNSIGNED NULL,
    resource_url        VARCHAR(1000) NULL,
    resource_name       VARCHAR(255) NULL,
    wps_file_id         VARCHAR(128) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_attachment_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO status_transition_rules (resource_type, from_status, to_status, required_stage_code, description) VALUES
('REQUIREMENT', 'PRODUCT_EDITING', 'PRODUCT_REVIEW', 'PRODUCT_EDITING', '产品提交评审：须填写规格与验收标准'),
('REQUIREMENT', 'PRODUCT_REVIEW', 'DEVELOPMENT', 'PRODUCT_REVIEW', '评审通过：须填写通过结论'),
('REQUIREMENT', 'PRODUCT_REVIEW', 'PRODUCT_EDITING', 'PRODUCT_REVIEW', '评审驳回：须填写驳回原因'),
('REQUIREMENT', 'DEVELOPMENT', 'TESTING', 'DEVELOPMENT', '研发完成：须填写实现说明'),
('REQUIREMENT', 'DEVELOPMENT', 'DONE', 'DEVELOPMENT', '缺陷修复完成：Bug 修复需求直接完成'),
('REQUIREMENT', 'TESTING', 'DONE', 'TESTING', '测试通过：须填写测试报告'),
('REQUIREMENT', 'TESTING', 'BUG_FIXING', 'TESTING', '测试失败：创建缺陷并进入 Bug 修复'),
('REQUIREMENT', 'BUG_FIXING', 'TESTING', 'BUG_FIXING', '缺陷修复确认：返回测试复验'),
('REQUIREMENT', 'TESTING', 'DEVELOPMENT', 'TESTING', '测试失败：须填写失败报告并退回研发'),
('REQUIREMENT', 'DONE', 'ARCHIVED', 'DONE', '产品验收通过：须填写验收说明并归档'),
('REQUIREMENT', 'DONE', 'DEVELOPMENT', 'DONE', '产品验收失败：须填写失败原因并退回研发');

INSERT INTO organizations (id, name, wps_tenant_id)
VALUES (1, '演示企业', 'demo-tenant');

INSERT INTO users (id, organization_id, wps_user_id, name, nick_name, company_name, email, account_state) VALUES
(1, 1, 'demo-wps-user-001', '张产品', '小张', '演示企业', 'zhangsan@teamspace.local', 'ACTIVE'),
(2, 1, 'demo-wps-user-002', '李研发', '小李', '演示企业', 'lisi@teamspace.local', 'ACTIVE'),
(3, 1, 'demo-wps-user-003', '王测试', '小王', '演示企业', 'wangwu@teamspace.local', 'ACTIVE'),
(4, 1, 'demo-wps-user-004', '赵六', '小赵', '演示企业', 'zhaoliu@teamspace.local', 'ACTIVE'),
(5, 1, 'demo-wps-user-005', '孙七', '小孙', '演示企业', 'sunqi@teamspace.local', 'ACTIVE');

INSERT INTO projects (id, organization_id, project_code, name, description, owner_user_id, status, setup_status, created_by)
VALUES
(1, 1, 'DEMO-001', 'TeamSpace 演示项目',
 '独立 Web 前端 + Go 业务服务 + MySQL，验证 WPS OAuth 登录与需求状态流转架构。',
 1, 'ACTIVE', 'MEMBERS_CONFIGURED', 1),
(2, 1, 'DEMO-002', 'WPS 协作试点',
 '探索 TeamSpace 与 WPS 企业协作的集成场景，验证 OAuth 登录与项目空间体验。',
 1, 'ACTIVE', 'CREATED', 1);

INSERT INTO project_setup_steps (project_id, step_code, completed, wps_related, completed_at, completed_by, note) VALUES
(1, 'CREATE_PROJECT', 1, 0, '2026-03-01 02:00:00.000', 1, '项目基础信息已填写'),
(1, 'ADD_MEMBERS', 1, 0, '2026-03-01 02:05:00.000', 1, '已添加项目成员'),
(1, 'CREATE_WPS_GROUP', 0, 1, NULL, NULL, 'WPS 群聊 Demo 未开放'),
(2, 'CREATE_PROJECT', 1, 0, '2026-03-01 03:00:00.000', 1, '项目基础信息已填写'),
(2, 'ADD_MEMBERS', 0, 0, NULL, NULL, NULL),
(2, 'CREATE_WPS_GROUP', 0, 1, NULL, NULL, NULL);

INSERT INTO project_members (project_id, user_id, role_code, role_codes, invited_by) VALUES
(1, 1, 'PROJECT_ADMIN', JSON_ARRAY('PROJECT_ADMIN'), 1),
(1, 2, 'MEMBER', JSON_ARRAY('MEMBER'), 1),
(1, 3, 'MEMBER', JSON_ARRAY('MEMBER'), 1),
(1, 4, 'MEMBER', JSON_ARRAY('MEMBER'), 1),
(2, 1, 'PROJECT_ADMIN', JSON_ARRAY('PROJECT_ADMIN'), 1);

INSERT INTO requirements (
    id, project_id, requirement_code, title, description, priority, development_scope,
    current_status, product_owner_user_id, developer_user_id, backend_developer_user_id, tester_user_id, created_by, expected_at
) VALUES
(1, 1, 'REQ-001', '搭建 TeamSpace 前后端架构',
 '交付独立 React 前端与 Go REST API，完成 WPS OAuth 登录、项目空间导航与 MySQL 持久化；DSH Agent 仅预留接口。',
 'HIGH', 'FULL_STACK', 'PRODUCT_EDITING', 1, NULL, NULL, NULL, 1, '2026-04-30 00:00:00.000'),
(2, 1, 'REQ-002', '实现需求状态流转',
 '产品编辑→评审→研发→测试→完成，每次流转须提交阶段材料并写入 status_change_log。',
 'HIGH', 'FULL_STACK', 'DEVELOPMENT', 1, 2, 3, 4, 1, '2026-05-15 00:00:00.000');

INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    spec_body, acceptance_criteria, product_owner_user_id,
    operator_user_id, submitted_at
) VALUES (
    1, 'PRODUCT_EDITING',
    '1. 独立 Web SPA（Vite+React）\n2. Go API 服务（8090）\n3. MySQL 全量 schema\n4. WPS OAuth 授权码登录',
    '1. 用户可 WPS 登录并创建项目\n2. 项目列表与详情可访问\n3. make mysql-init 后中文种子数据无乱码',
    1, 1, '2026-03-02 01:00:00.000'
);

INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    spec_body, acceptance_criteria, product_owner_user_id,
    operator_user_id, submitted_at
) VALUES (
    2, 'PRODUCT_EDITING',
    '1. 定义 requirement 状态机\n2. 阶段提交表 requirement_stage_submissions\n3. 流转 API 校验必填字段',
    '1. 缺少阶段材料时 transition 返回 400\n2. status_change_log 记录 remark\n3. 种子数据覆盖各阶段示例',
    1, 1, '2026-03-03 02:00:00.000'
);

INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    review_result, review_comment, reviewer_user_id,
    operator_user_id, submitted_at
) VALUES (
    2, 'PRODUCT_REVIEW',
    'APPROVED', '方案清晰，状态机与阶段提交分离合理，同意进入研发。',
    1, 1, '2026-03-04 03:00:00.000'
);

INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    dev_summary, implementation_notes, developer_user_id,
    operator_user_id, submitted_at
) VALUES (
    2, 'DEVELOPMENT',
    '已完成 domain 校验、schema 重设计与 transition 接口改造。',
    '新增 status_transition_rules 权威表；requirement_stage_submissions 按阶段分列；WPS 字段保持可空。',
    2, 2, '2026-03-05 04:00:00.000'
);

INSERT INTO bugs (
    id, project_id, requirement_id, bug_code, title, description,
    steps_to_reproduce, environment, severity, status, reporter_user_id, assignee_user_id
) VALUES (
    1, 1, 2, 'BUG-001', '会话列表空态样式未对齐',
    '进入会话 Tab 且无会话时，空态文案与卡片内边距与设计稿不一致。',
    '1. 登录 TeamSpace\n2. 进入「会话」\n3. 选择无会话的项目',
    'Chrome 127 / Windows 11 / Vite dev 5173',
    'LOW', 'OPEN', 3, 2
);

INSERT INTO conversation (id, project_id, requirement_id, creator_user_id, title, conversation_type, status)
VALUES
(1, 1, NULL, 1, '项目启动讨论', 'PROJECT', 'ACTIVE'),
(2, 1, 1, 1, 'REQ-001 需求澄清', 'REQUIREMENT', 'ACTIVE');

INSERT INTO conversation_message (conversation_id, role, content, status, created_by)
VALUES
(1, 'USER', 'TeamSpace 第一版先搭架构骨架，AI 能力后续接入。', 'COMPLETED', 1),
(1, 'ASSISTANT', '收到。当前阶段聚焦：登录、项目空间、需求流转、会话本地保存；DSH 调用接口预留。', 'COMPLETED', NULL),
(2, 'USER', '前后端目录结构需要对齐设计文档。', 'COMPLETED', 1);
