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

DROP TABLE IF EXISTS requirement_stage_submissions;
DROP TABLE IF EXISTS status_change_log;
DROP TABLE IF EXISTS project_repositories;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS requirements;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ── 用户 ─────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id                      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
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

    UNIQUE KEY uk_user_wps_id (wps_user_id)
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

    created_by          BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    archived_at         DATETIME(3) NULL,

    UNIQUE KEY uk_project_code (project_code),
    KEY idx_project_owner (owner_user_id),
    KEY idx_project_creator (created_by),
    KEY idx_project_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 项目代码仓库（一个项目可关联多个仓库，每个仓库绑定研发方向）
CREATE TABLE project_repositories (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    project_id          BIGINT UNSIGNED NOT NULL,
    repo_name           VARCHAR(255) NOT NULL DEFAULT '',
    repo_url            VARCHAR(1000) NOT NULL,
    default_branch      VARCHAR(128) NOT NULL DEFAULT 'main',
    -- 研发方向：FRONTEND / BACKEND / MOBILE
    dev_direction       VARCHAR(32) NOT NULL,
    sort_order          INT UNSIGNED NOT NULL DEFAULT 0,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE KEY uk_project_repo_url (project_id, repo_url(255)),
    KEY idx_project_repo_project (project_id),
    KEY idx_project_repo_direction (project_id, dev_direction)
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

    -- 工作项类型：REQUIREMENT（普通需求）或 BUG（缺陷）
    item_type           VARCHAR(16) NOT NULL DEFAULT 'REQUIREMENT',

    title               VARCHAR(255) NOT NULL,
    description         MEDIUMTEXT NOT NULL,
    priority            VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',

    -- 当前状态（新状态机）
    current_status      VARCHAR(64) NOT NULL DEFAULT 'CREATED',
    status_version      INT UNSIGNED NOT NULL DEFAULT 0,

    planned_start_at    DATETIME(3) NULL,
    expected_at         DATETIME(3) NULL,

    -- 研发方向：FRONTEND / BACKEND，多选用逗号分隔，例如 FRONTEND,BACKEND
    dev_directions      VARCHAR(64) NOT NULL DEFAULT 'FRONTEND',

    -- 角色分配（前端负责人 = developer_user_id；后端负责人 = backend_developer_user_id）
    developer_user_id          BIGINT UNSIGNED NULL,
    backend_developer_user_id  BIGINT UNSIGNED NULL,
    tester_user_id             BIGINT UNSIGNED NULL,

    -- 研发完成标记（按方向）
    frontend_dev_completed TINYINT(1) NOT NULL DEFAULT 0,
    backend_dev_completed  TINYINT(1) NOT NULL DEFAULT 0,

    -- Bug 子项关联主工作项
    parent_item_id      BIGINT UNSIGNED NULL,
    -- 记录 Bug 在哪个阶段被创建（TESTING / REGRESSION）
    triggered_at_stage  VARCHAR(64) NULL,

    created_by          BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    closed_at           DATETIME(3) NULL,

    UNIQUE KEY uk_requirement_code (project_id, requirement_code),
    KEY idx_requirement_project_status (project_id, current_status),
    KEY idx_requirement_item_type (project_id, item_type),
    KEY idx_requirement_dev (developer_user_id),
    KEY idx_requirement_backend_dev (backend_developer_user_id),
    KEY idx_requirement_tester (tester_user_id),
    KEY idx_requirement_creator (created_by),
    KEY idx_requirement_parent (parent_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE requirement_stage_submissions (
    id                      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    requirement_id          BIGINT UNSIGNED NOT NULL,
    -- stage_code 与状态机对应：PRODUCT_DESIGN / DEV_DESIGN / DEVELOPMENT / TESTING / PRODUCT_ACCEPTANCE / REGRESSION
    stage_code              VARCHAR(64) NOT NULL,

    -- PRODUCT_DESIGN 阶段（产品方案设计）
    spec_body               MEDIUMTEXT NULL,    -- 产品方案内容
    acceptance_criteria     MEDIUMTEXT NULL,    -- 验收标准

    -- DEV_DESIGN 阶段（研发方案设计）
    dev_design_doc          MEDIUMTEXT NULL,    -- 研发方案文档

    -- DEVELOPMENT 阶段（研发开发完成）
    dev_summary             MEDIUMTEXT NULL,
    implementation_notes    MEDIUMTEXT NULL,
    developer_user_id       BIGINT UNSIGNED NULL,

    -- TESTING / PRODUCT_ACCEPTANCE 退回研发时填写
    return_reason           MEDIUMTEXT NULL,

    -- TESTING 阶段
    test_result             VARCHAR(16) NULL,   -- PASS / FAIL
    test_summary            MEDIUMTEXT NULL,
    test_cases_covered      MEDIUMTEXT NULL,
    tester_user_id          BIGINT UNSIGNED NULL,

    -- PRODUCT_ACCEPTANCE 阶段
    acceptance_note         MEDIUMTEXT NULL,    -- 验收说明

    -- REGRESSION 阶段
    regression_result       VARCHAR(16) NULL,   -- PASS / FAIL
    regression_summary      MEDIUMTEXT NULL,

    operator_user_id        BIGINT UNSIGNED NOT NULL,
    submitted_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE KEY uk_requirement_stage (requirement_id, stage_code),
    KEY idx_stage_requirement (requirement_id),
    KEY idx_stage_operator (operator_user_id)
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

-- Bug 已整合进 requirements 表（item_type = 'BUG'），不再单独建表。

INSERT INTO users (id, wps_user_id, name, nick_name, company_name, email, account_state) VALUES
(1, 'demo-wps-user-001', '张产品', '小张', '演示企业', 'zhangsan@teamspace.local', 'ACTIVE'),
(2, 'demo-wps-user-002', '李研发', '小李', '演示企业', 'lisi@teamspace.local', 'ACTIVE'),
(3, 'demo-wps-user-003', '王测试', '小王', '演示企业', 'wangwu@teamspace.local', 'ACTIVE'),
(4, 'demo-wps-user-004', '赵六', '小赵', '演示企业', 'zhaoliu@teamspace.local', 'ACTIVE'),
(5, 'demo-wps-user-005', '孙七', '小孙', '演示企业', 'sunqi@teamspace.local', 'ACTIVE');

INSERT INTO projects (id, project_code, name, description, owner_user_id, status, setup_status, created_by)
VALUES
(1, 'DEMO-001', 'TeamSpace 演示项目',
 '独立 Web 前端 + Go 业务服务 + MySQL，验证 WPS OAuth 登录与需求状态流转架构。',
 1, 'ACTIVE', 'ACTIVE', 1),
(2, 'DEMO-002', 'WPS 协作试点',
 '探索 TeamSpace 与 WPS 企业协作的集成场景，验证 OAuth 登录与项目空间体验。',
 1, 'ACTIVE', 'ACTIVE', 1);

INSERT INTO project_members (project_id, user_id, role_code, role_codes, invited_by) VALUES
(1, 1, 'PROJECT_ADMIN', JSON_ARRAY('PROJECT_ADMIN'), 1),
(1, 2, 'MEMBER', JSON_ARRAY('MEMBER'), 1),
(1, 3, 'MEMBER', JSON_ARRAY('MEMBER'), 1),
(1, 4, 'MEMBER', JSON_ARRAY('MEMBER'), 1),
(2, 1, 'PROJECT_ADMIN', JSON_ARRAY('PROJECT_ADMIN'), 1);

INSERT INTO project_repositories (project_id, repo_name, repo_url, default_branch, dev_direction, sort_order) VALUES
(1, 'teamspace-web', 'https://gitlab.example.com/teamspace/web.git', 'main', 'FRONTEND', 1),
(1, 'teamspace-server', 'https://gitlab.example.com/teamspace/server.git', 'main', 'BACKEND', 2);

-- REQ-001：产品设计阶段
INSERT INTO requirements (
    id, project_id, requirement_code, item_type, title, description, priority,
    current_status, dev_directions, developer_user_id, backend_developer_user_id, tester_user_id,
    created_by, expected_at
) VALUES
(1, 1, 'REQ-001', 'REQUIREMENT', '搭建 TeamSpace 前后端架构',
 '交付独立 React 前端与 Go REST API，完成 WPS OAuth 登录、项目空间导航与 MySQL 持久化。',
 'HIGH', 'PRODUCT_DESIGN', 'FRONTEND,BACKEND', NULL, NULL, NULL, 1, '2026-04-30 00:00:00.000'),
-- REQ-002：研发中（含前后端与测试人员）
(2, 1, 'REQ-002', 'REQUIREMENT', '实现工作项状态流转',
 '产品设计→研发方案→研发→测试→产品验收→回归，每次流转须提交阶段材料并写入 status_change_log。',
 'HIGH', 'DEVELOPMENT', 'FRONTEND,BACKEND', 2, 4, 3, 1, '2026-05-15 00:00:00.000');

-- REQ-001 产品设计阶段提交
INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    spec_body, acceptance_criteria,
    operator_user_id, submitted_at
) VALUES (
    1, 'PRODUCT_DESIGN',
    '1. 独立 Web SPA（Vite+React）\n2. Go API 服务（8090）\n3. MySQL 全量 schema\n4. WPS OAuth 授权码登录',
    '1. 用户可 WPS 登录并创建项目\n2. 项目列表与详情可访问\n3. make mysql-init 后中文种子无乱码',
    1, '2026-03-02 01:00:00.000'
);

-- REQ-002 产品设计阶段
INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    spec_body, acceptance_criteria,
    operator_user_id, submitted_at
) VALUES (
    2, 'PRODUCT_DESIGN',
    '1. 定义工作项状态机\n2. 阶段提交表 requirement_stage_submissions\n3. 流转 API 校验必填字段',
    '1. 缺少阶段材料时 transition 返回 400\n2. status_change_log 记录 remark\n3. Bug 子项关联主工作项',
    1, '2026-03-03 02:00:00.000'
);

-- REQ-002 研发方案设计阶段
INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    dev_design_doc,
    operator_user_id, submitted_at
) VALUES (
    2, 'DEV_DESIGN',
    '状态机采用 domain 层硬编码规则，requirement_stage_submissions 按阶段分列，Bug 子项通过 parent_item_id 关联主工作项。',
    2, '2026-03-04 03:00:00.000'
);

-- REQ-002 研发阶段
INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code,
    dev_summary, implementation_notes, developer_user_id,
    operator_user_id, submitted_at
) VALUES (
    2, 'DEVELOPMENT',
    '已完成 domain 校验、schema 重设计与 transition 接口改造。',
    'Bug 子项走独立流程（DEVELOPMENT→TESTING→PRODUCT_ACCEPTANCE→CLOSED），主工作项测试/回归前需 Bug 全部 CLOSED。',
    2, 2, '2026-03-05 04:00:00.000'
);

-- BUG-001：测试阶段发现的 Bug 子项（item_type=BUG，关联 REQ-002，直接从 DEVELOPMENT 开始）
INSERT INTO requirements (
    id, project_id, requirement_code, item_type, title, description, priority,
    current_status, developer_user_id, tester_user_id,
    parent_item_id, triggered_at_stage, created_by
) VALUES (
    3, 1, 'BUG-001', 'BUG', '需求列表筛选状态标签未高亮',
    '在需求列表中按状态筛选时，部分状态标签未能正确高亮。\n\n复现步骤：\n1. 登录 TeamSpace\n2. 进入「需求」列表\n3. 点击状态标签筛选',
    'LOW', 'DEVELOPMENT', 2, 3,
    2, 'TESTING', 3
);
