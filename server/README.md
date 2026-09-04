# TeamSpace 业务服务

DSH TeamSpace 的独立 HTTP 服务：MySQL 持久化、REST API，供独立 Web 前端（`../web/`）访问。

默认监听 `http://127.0.0.1:8090`。

## 第一版接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/healthz` | 健康检查 |
| GET | `/api/auth/login` | 返回 OAuth 参数 JSON（`client_id`、`state`、`redirect_url`） |
| GET | `/api/auth/callback` | OAuth 回调（校验 state、换 token、写用户、发系统 token） |
| GET | `/api/auth/me` | 当前登录用户 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/projects` | 项目列表（需登录） |
| GET | `/api/projects/{id}` | 项目详情（含成员） |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/{id}/members` | 项目成员 |
| GET | `/api/projects/{id}/requirements` | 需求列表 |
| POST | `/api/projects/{id}/requirements` | 创建需求 |
| GET | `/api/requirements/{id}` | 需求详情 |
| POST | `/api/requirements/{id}/transition` | 状态流转 |
| GET | `/api/projects/{id}/bugs` | Bug 列表 |
| GET | `/api/projects/{id}/conversations` | 会话列表 |
| POST | `/api/projects/{id}/conversations` | 创建会话 |
| GET | `/api/conversations/{id}` | 会话详情 |
| GET | `/api/conversations/{id}/messages` | 消息列表 |
| POST | `/api/conversations/{id}/messages` | 发送消息（AI stub 回复） |
| POST | `/api/ai/run` | AI 接口预留（stub，不调用 DSH） |
| GET | `/api/auth/config` | OAuth 是否已配置（前端登录页检查） |
| GET | `/api/auth/status` | 登录态与 WPS token 续期状态 |

### WPS OAuth 登录与自动续期

参考 [WPS OAuth 登录需求文档](https://365.kdocs.cn/l/cjhDL0Ynov4J)：

1. 前端 `GET /api/auth/login` → 后端返回 `{ client_id, state, redirect_url }`
2. 前端跳转 `redirect_url` → 用户在 WPS 授权
3. WPS 回调 `GET /api/auth/callback`（后端 8090）：校验 **state**、换 `access_token`、拉 `/v7/users/current`、**WPS token 写入 users 表**、创建系统 session
4. 后端重定向前端 `/?token=<系统token>`，前端存入 localStorage，后续 API 带 `Authorization: Bearer`
5. **自动续期**：每次鉴权请求时，若 users 表中的 `wps_access_token` 即将过期，服务端用 `refresh_token` 续期并回写 users 表
6. 前端每 5 分钟调用 `GET /api/auth/status` 触发静默保活
7. `refresh_token` 过期后需重新登录

**users 表核心字段**：`wps_user_id`、`name`、`nick_name`、`avatar_url`、`company_name`；WPS OAuth token 存同表便于后续调用 WPS API。

完整分步验收见 [`../ARCHITECTURE.md`](../ARCHITECTURE.md)。

开发时前端通过 Vite 代理访问上述路径（见 `../web/vite.config.ts`）。

## Docker：仅启动 MySQL

`docker-compose.yml` 只包含数据库，应用在宿主机运行。

```sh
cp .env.example .env
make docker-up          # 或 make mysql-only（等价）
docker compose ps       # 等待 mysql healthy
make run                # 另开终端，启动 Go 服务
curl http://127.0.0.1:8090/healthz
```

**MySQL 初始化**

- 权威脚本：**`deploy/mysql/schema.sql`**（全量建表，不做增量 ALTER）
- 数据目录：`./data/mysql`（本地持久化，已加入 `.gitignore`）
- **空目录首次** `docker compose up`：自动执行 `schema.sql`
- **已有数据卷 / 表结构变更**：`make mysql-init` 会 **DROP + CREATE** 重建全部表（含演示种子，会清空业务数据）

```sh
make mysql-init
```

**常用命令**

| 命令 | 说明 |
|------|------|
| `make docker-up` | 后台启动 MySQL |
| `make docker-down` | 停止并移除容器（数据卷保留） |
| `make docker-logs` | 查看 MySQL 日志 |
| `make mysql-init` | 执行 `schema.sql` 全量重建表结构（DROP + CREATE） |

默认连接见 `.env`（Compose 与 Go 服务共用 `TEAMSPACE_DB_*`）。

## 本地运行（应用 + MySQL）

```sh
cp .env.example .env
# 先 make docker-up 启动 MySQL，或改用自有 MySQL 并修改 .env
make tidy
make run
```

> **注意：** 若未配置 `.env` 且未 export 环境变量，程序会使用默认账号 `teamspace/teamspace`（与 Docker Compose 一致）。本地自有 MySQL 通常只有 `root`，请在 `.env` 中改为 `TEAMSPACE_DB_USER=root` 及对应密码。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `TEAMSPACE_HOST` | `127.0.0.1` | 监听地址 |
| `TEAMSPACE_PORT` | `8090` | 监听端口 |
| `TEAMSPACE_DB_HOST` | `127.0.0.1` | MySQL 主机 |
| `TEAMSPACE_DB_PORT` | `3306` | MySQL 端口 |
| `TEAMSPACE_DB_USER` | `teamspace` | MySQL 用户 |
| `TEAMSPACE_DB_PASSWORD` | `teamspace` | MySQL 密码 |
| `TEAMSPACE_DB_NAME` | `teamspace` | 数据库名 |
| `WPS_OAUTH_CLIENT_ID` | — | WPS 应用 AppID |
| `WPS_OAUTH_CLIENT_SECRET` | — | WPS 应用 AppSecret |
| `WPS_OAUTH_REDIRECT_URI` | — | 授权回调（须与 WPS 后台一致，推荐 `http://127.0.0.1:8090/api/auth/callback`） |
| `WPS_OAUTH_SCOPE` | `kso.user_base.read kso.file.search` | 用户 OAuth scope（文档搜索依赖用户 Token） |
| `WPS_OAUTH_SIGNATURE_ENABLED` | `true` | 是否对 `/v7/users/current` 使用 KSO-1 签名 |
| `WPS_OAUTH_REFRESH_LEAD_SEC` | `300` | access_token 到期前多少秒自动续期 |
| `TEAMSPACE_SESSION_SECRET` | `change-me-in-production` | Session 密钥（预留） |
| `TEAMSPACE_FRONTEND_REDIRECT_URL` | `http://127.0.0.1:5173` | OAuth 成功后跳回独立 Web（携带 `?token=`） |

## WPS OAuth 配置

1. 在 [365 开放平台](https://365.kdocs.cn/3rd/open/developer/home) 创建企业自建应用，开通 `kso.user_base.read`。
2. **安全设置 → 用户授权回调** 填入与 `WPS_OAUTH_REDIRECT_URI` 完全一致的地址。
   - **本地开发**：`http://127.0.0.1:8090/api/auth/callback`（WPS 直接回调后端 API）
   - **生产**：`https://your-domain/api/auth/callback`
3. 复制 `.env.example` 为 `.env`，填入 `WPS_OAUTH_CLIENT_ID` 与 `WPS_OAUTH_CLIENT_SECRET`。
4. 启动 `server/` 与 `../web/` 前端，在页面点击「使用 WPS 登录」。

授权流程：`/api/auth/login`（JSON）→ 前端跳转 WPS → `/api/auth/callback` → 跳回 `TEAMSPACE_FRONTEND_REDIRECT_URL?token=...`。

## 与前端联调

```sh
# 终端 1：MySQL + 业务服务
cd server && make docker-up && make run

# 终端 2：独立 Web
cd ../web && npm install && npm run dev
```

浏览器打开 http://127.0.0.1:5173

## 目录

```text
server/
├── cmd/teamspace/          # 入口
├── internal/
│   ├── config/             # 环境变量
│   ├── handler/            # HTTP 路由
│   └── repository/         # MySQL
├── deploy/mysql/
│   └── schema.sql          # 权威全量建表（每次 init 重建）
├── Dockerfile
├── docker-compose.yml
└── Makefile
```

完整表结构见 `deploy/mysql/schema.sql`。核心设计：

- **需求状态机**：`status_transition_rules` 定义合法流转；每次流转须在 `stage_submission` 中提交当前阶段真实业务字段
- **阶段提交**：`requirement_stage_submissions` 按阶段存储规格/评审/研发/测试/发布材料；后端 `domain.ValidateStageSubmission` 校验必填
- **项目 onboarding**：`project_setup_steps` 记录创建项目、添加成员、创建 WPS 群三步；WPS 群步骤 `wps_related=1` 且 Demo 可不完成
- **WPS 可空字段**：`projects.wps_group_*`、`conversation.wps_chat_id`、`message_attachment.wps_file_id` 等
- **Bug**：`description`、`steps_to_reproduce`、`environment` 必填；必须关联 `requirement_id`
- **成员**：`project_members.invited_by` 记录系统内邀请人（非 WPS 通讯录）

流转 API 示例：

```json
POST /api/requirements/{id}/transition
{
  "to_status": "PRODUCT_REVIEW",
  "stage_submission": {
    "spec_body": "...",
    "acceptance_criteria": "...",
    "product_owner_user_id": 1,
    "remark": "提交产品评审"
  }
}
```
