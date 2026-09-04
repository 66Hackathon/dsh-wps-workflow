-- TeamSpace 权威全量建表脚本
-- 每次 make mysql-init 均 DROP + CREATE 完整表结构（不做增量 ALTER）
--
-- 设计原则：
-- 1. 状态流转前必须提交对应阶段的完整业务信息（requirement_stage_submissions）
-- 2. WPS 协作字段（群聊/云文档等）均可空，Demo 未开放时不强制填写
-- 3. 成员选择使用系统用户（users 表），非 WPS 通讯录
-- 4. 不使用数据库外键；删除时由应用在同一事务内按依赖顺序同步删除关联行
-- 5. 文档暂仅支持 WPS 在线文档（storage_type=WPS）；OSS/EXTERNAL 字段预留

CREATE DATABASE IF NOT EXISTS teamspace
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE teamspace;

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS status_change_logs;
DROP TABLE IF EXISTS requirement_stage_submissions;
DROP TABLE IF EXISTS requirements;
DROP TABLE IF EXISTS project_repositories;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- 用户表
CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '系统用户ID',
    wps_user_id VARCHAR(128) NOT NULL COMMENT 'WPS用户唯一标识',
    name VARCHAR(128) NOT NULL COMMENT '用户名称',
    avatar_url VARCHAR(1000) DEFAULT NULL COMMENT '头像地址',
    company_name VARCHAR(255) DEFAULT NULL COMMENT '所属企业名称',
    email VARCHAR(255) DEFAULT NULL COMMENT '用户邮箱',
    wps_access_token TEXT DEFAULT NULL COMMENT 'WPS Access Token，应用层加密保存',
    wps_refresh_token TEXT DEFAULT NULL COMMENT 'WPS Refresh Token，应用层加密保存',
    wps_token_expires_at DATETIME(3) DEFAULT NULL COMMENT 'WPS Access Token过期时间',
    wps_refresh_expires_at DATETIME(3) DEFAULT NULL COMMENT 'WPS Refresh Token过期时间',
    account_state VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '账号状态：ACTIVE/DISABLED',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_wps_user_id (wps_user_id),
    KEY idx_users_account_state (account_state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户及WPS授权信息表';

-- 用户会话表
CREATE TABLE user_sessions (
    id VARCHAR(64) PRIMARY KEY COMMENT '随机生成的Session ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '关联users.id',
    expires_at DATETIME(3) NOT NULL COMMENT 'Session过期时间',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Session创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Session更新时间，可用于滑动过期',
    KEY idx_session_user (user_id),
    KEY idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户登录会话表';

-- 项目表
CREATE TABLE projects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '项目ID',
    name VARCHAR(255) NOT NULL COMMENT '项目名称',
    description TEXT DEFAULT NULL COMMENT '项目描述',
    owner_user_id BIGINT UNSIGNED NOT NULL COMMENT '项目管理员，关联users.id，默认是项目创建人',
    wps_group_id VARCHAR(128) DEFAULT NULL COMMENT '绑定的WPS项目群ID',
    wps_group_name VARCHAR(255) DEFAULT NULL COMMENT '绑定的WPS项目群名称',
    wps_doc_folder_id VARCHAR(128) DEFAULT NULL COMMENT '项目对应的WPS文档目录ID',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '项目创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '项目更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_projects_wps_group_id (wps_group_id),
    KEY idx_projects_owner_user_id (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目空间表';

-- 文档表（当前仅落库 WPS 在线文档；OSS 字段预留）
CREATE TABLE documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文档ID',
    project_id BIGINT UNSIGNED NOT NULL COMMENT '所属项目，关联projects.id',
    requirement_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联需求或Bug；项目公共文档为空',
    stage_code VARCHAR(64) DEFAULT NULL COMMENT '关联阶段码 PRODUCT_DESIGN/DEV_DESIGN/...；非阶段文档为空',
    name VARCHAR(255) NOT NULL COMMENT '文档名称',
    storage_type VARCHAR(32) NOT NULL DEFAULT 'WPS' COMMENT '存储类型：当前仅 WPS；预留 OSS/EXTERNAL',
    object_key VARCHAR(1000) DEFAULT NULL COMMENT 'OSS对象Key（预留）',
    file_url VARCHAR(2000) DEFAULT NULL COMMENT 'WPS文档链接或外部地址',
    mime_type VARCHAR(128) DEFAULT NULL COMMENT 'MIME类型（预留）',
    file_size BIGINT UNSIGNED DEFAULT NULL COMMENT '文件大小字节（预留）',
    created_by BIGINT UNSIGNED NOT NULL COMMENT '创建人，关联users.id',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_documents_project_id (project_id),
    KEY idx_documents_requirement_id (requirement_id),
    KEY idx_documents_stage_code (requirement_id, stage_code),
    KEY idx_documents_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目/需求/阶段关联文档表（暂仅WPS）';

-- 项目成员表（管理员 = projects.owner_user_id，成员无角色字段）
CREATE TABLE project_members (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '项目成员记录ID',
    project_id BIGINT UNSIGNED NOT NULL COMMENT '所属项目，关联projects.id',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '项目成员，关联users.id',
    invited_by BIGINT UNSIGNED NOT NULL COMMENT '邀请人，关联users.id',
    joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '加入项目时间',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_project_members_project_user (project_id, user_id),
    KEY idx_project_members_user_id (user_id),
    KEY idx_project_members_invited_by (invited_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目成员表';

-- 项目仓库表（每种类型最多一条）
CREATE TABLE project_repositories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '项目仓库配置ID',
    project_id BIGINT UNSIGNED NOT NULL COMMENT '所属项目，关联projects.id',
    repository_type VARCHAR(32) NOT NULL COMMENT '仓库类型：FRONTEND/BACKEND/MOBILE',
    repository_url VARCHAR(1000) NOT NULL COMMENT '用户填写的原始仓库Remote URL',
    normalized_url VARCHAR(1000) NOT NULL COMMENT '标准化仓库地址，用于匹配本地Git仓库',
    default_branch VARCHAR(128) NOT NULL DEFAULT 'main' COMMENT '默认分支',
    configured_by BIGINT UNSIGNED NOT NULL COMMENT '仓库配置人，关联users.id',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_project_repositories_project_type (project_id, repository_type),
    KEY idx_project_repositories_normalized_url (normalized_url(255)),
    KEY idx_project_repositories_configured_by (configured_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目前端、后端及移动端代码仓库表';

-- 需求和Bug表
CREATE TABLE requirements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '需求或Bug ID',
    project_id BIGINT UNSIGNED NOT NULL COMMENT '所属项目ID',
    requirement_type VARCHAR(32) NOT NULL DEFAULT 'REQUIREMENT' COMMENT '类型：REQUIREMENT普通需求/BUG缺陷',
    parent_requirement_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联的原需求ID；普通需求为空，Bug必须填写',
    source_stage_code VARCHAR(64) DEFAULT NULL COMMENT 'Bug产生阶段：TESTING/PRODUCT_ACCEPTANCE/REGRESSION；普通需求为空',
    title VARCHAR(255) NOT NULL COMMENT '需求或Bug标题',
    description TEXT DEFAULT NULL COMMENT '需求或Bug描述',
    priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM' COMMENT '优先级：LOW/MEDIUM/HIGH/URGENT',
    development_type VARCHAR(32) DEFAULT NULL COMMENT '研发类型：FRONTEND/BACKEND/MOBILE；进入研发阶段前填写',
    current_status VARCHAR(64) NOT NULL DEFAULT 'PRODUCT_DESIGN' COMMENT '当前状态；Bug使用DEVELOPMENT/TESTING/COMPLETED',
    developer_user_id BIGINT UNSIGNED DEFAULT NULL COMMENT '研发负责人ID',
    tester_user_id BIGINT UNSIGNED DEFAULT NULL COMMENT '测试负责人ID',
    created_by BIGINT UNSIGNED NOT NULL COMMENT '创建人ID',
    regression_result VARCHAR(32) DEFAULT NULL COMMENT '普通需求回归结果：PASS/FAIL',
    status_version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '状态版本号，用于并发扭转控制',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    completed_at DATETIME(3) DEFAULT NULL COMMENT '流程结束时间',
    PRIMARY KEY (id),
    KEY idx_requirements_project_status (project_id, current_status),
    KEY idx_requirements_parent_status (parent_requirement_id, current_status),
    KEY idx_requirements_type (project_id, requirement_type),
    KEY idx_requirements_developer_status (developer_user_id, current_status),
    KEY idx_requirements_tester_status (tester_user_id, current_status),
    KEY idx_requirements_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='需求和Bug表';

-- 需求阶段处理表
CREATE TABLE requirement_stage_submissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '阶段提交记录ID',
    requirement_id BIGINT UNSIGNED NOT NULL COMMENT '所属需求或Bug ID',
    stage_code VARCHAR(64) NOT NULL COMMENT '提交阶段：PRODUCT_DESIGN/DEV_DESIGN/DEVELOPMENT/TESTING/PRODUCT_ACCEPTANCE/REGRESSION',
    result VARCHAR(32) DEFAULT NULL COMMENT '阶段结果：COMPLETED/PASS/FAIL',
    content JSON DEFAULT NULL COMMENT '阶段提交内容（方案/总结/测试/验收/回归说明等）',
    operator_user_id BIGINT UNSIGNED NOT NULL COMMENT '提交人ID',
    submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '提交时间',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_stage_submission_requirement (requirement_id, submitted_at),
    KEY idx_stage_submission_stage (requirement_id, stage_code, submitted_at),
    KEY idx_stage_submission_operator (operator_user_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='需求和Bug阶段提交记录表';

-- 需求和Bug状态变更记录表
CREATE TABLE status_change_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '状态变更记录ID',
    requirement_id BIGINT UNSIGNED NOT NULL COMMENT '需求或Bug ID',
    from_status VARCHAR(64) DEFAULT NULL COMMENT '变更前状态；创建时为空',
    to_status VARCHAR(64) NOT NULL COMMENT '变更后状态',
    operator_user_id BIGINT UNSIGNED NOT NULL COMMENT '执行状态扭转的用户ID',
    stage_submission_id BIGINT UNSIGNED DEFAULT NULL COMMENT '触发状态扭转的阶段提交记录ID',
    remark VARCHAR(1000) DEFAULT NULL COMMENT '状态变更说明',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '状态变更时间',
    PRIMARY KEY (id),
    KEY idx_status_logs_requirement (requirement_id, created_at),
    KEY idx_status_logs_operator (operator_user_id, created_at),
    KEY idx_status_logs_submission (stage_submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='需求和Bug状态变更记录表';

-- ── 演示种子 ─────────────────────────────────────────────────────────────────

INSERT INTO users (id, wps_user_id, name, company_name, email, account_state) VALUES
(1, 'demo-wps-user-001', '张产品', '演示企业', 'zhangsan@teamspace.local', 'ACTIVE'),
(2, 'demo-wps-user-002', '李研发', '演示企业', 'lisi@teamspace.local', 'ACTIVE'),
(3, 'demo-wps-user-003', '王测试', '演示企业', 'wangwu@teamspace.local', 'ACTIVE'),
(4, 'demo-wps-user-004', '赵六', '演示企业', 'zhaoliu@teamspace.local', 'ACTIVE'),
(5, 'demo-wps-user-005', '孙七', '演示企业', 'sunqi@teamspace.local', 'ACTIVE');

INSERT INTO projects (id, name, description, owner_user_id) VALUES
(1, 'TeamSpace 演示项目',
 '独立 Web 前端 + Go 业务服务 + MySQL，验证 WPS OAuth 登录与需求状态流转架构。', 1),
(2, 'WPS 协作试点',
 '探索 TeamSpace 与 WPS 企业协作的集成场景，验证 OAuth 登录与项目空间体验。', 1);

INSERT INTO project_members (project_id, user_id, invited_by) VALUES
(1, 1, 1),
(1, 2, 1),
(1, 3, 1),
(1, 4, 1),
(2, 1, 1);

INSERT INTO project_repositories (project_id, repository_type, repository_url, normalized_url, default_branch, configured_by) VALUES
(1, 'FRONTEND', 'https://gitlab.example.com/teamspace/web.git', 'https://gitlab.example.com/teamspace/web.git', 'main', 1),
(1, 'BACKEND', 'https://gitlab.example.com/teamspace/server.git', 'https://gitlab.example.com/teamspace/server.git', 'main', 1);

INSERT INTO requirements (
    id, project_id, requirement_type, title, description, priority,
    current_status, development_type, developer_user_id, tester_user_id, created_by
) VALUES
(1, 1, 'REQUIREMENT', '搭建 TeamSpace 前后端架构',
 '交付独立 React 前端与 Go REST API，完成 WPS OAuth 登录、项目空间导航与 MySQL 持久化。',
 'HIGH', 'PRODUCT_DESIGN', NULL, NULL, NULL, 1),
(2, 1, 'REQUIREMENT', '实现工作项状态流转',
 '产品设计→研发方案→研发→测试→产品验收→回归，每次流转须提交阶段材料。',
 'HIGH', 'DEVELOPMENT', 'FRONTEND', 2, 3, 1);

INSERT INTO requirement_stage_submissions (
    requirement_id, stage_code, result, content, operator_user_id, submitted_at
) VALUES
(1, 'PRODUCT_DESIGN', 'COMPLETED',
 JSON_OBJECT('spec_body', '1. 独立 Web SPA\\n2. Go API\\n3. MySQL schema\\n4. WPS OAuth',
             'acceptance_criteria', '用户可登录并创建项目'),
 1, '2026-03-02 01:00:00.000'),
(2, 'PRODUCT_DESIGN', 'COMPLETED',
 JSON_OBJECT('spec_body', '定义状态机与阶段提交', 'acceptance_criteria', 'transition 校验必填'),
 1, '2026-03-03 02:00:00.000'),
(2, 'DEV_DESIGN', 'COMPLETED',
 JSON_OBJECT('dev_design_doc', '状态机 domain 硬编码，阶段提交 content JSON'),
 2, '2026-03-04 03:00:00.000'),
(2, 'DEVELOPMENT', 'COMPLETED',
 JSON_OBJECT('dev_summary', '完成 domain 与 transition 改造', 'implementation_notes', 'Bug 走独立流程'),
 2, '2026-03-05 04:00:00.000');

INSERT INTO requirements (
    id, project_id, requirement_type, parent_requirement_id, source_stage_code,
    title, description, priority, current_status, development_type,
    developer_user_id, tester_user_id, created_by
) VALUES (
    3, 1, 'BUG', 2, 'TESTING',
    '需求列表筛选状态标签未高亮',
    '按状态筛选时部分标签未能正确高亮。',
    'LOW', 'DEVELOPMENT', 'FRONTEND', 2, 3, 3
);

INSERT INTO documents (project_id, requirement_id, stage_code, name, storage_type, file_url, created_by) VALUES
(1, 1, 'PRODUCT_DESIGN', 'TeamSpace 产品方案', 'WPS', 'https://www.kdocs.cn/l/demo-product-spec', 1),
(1, 2, 'DEV_DESIGN', '状态机研发方案', 'WPS', 'https://www.kdocs.cn/l/demo-dev-design', 2);
