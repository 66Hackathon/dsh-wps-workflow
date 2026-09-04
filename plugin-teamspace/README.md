# DSH TeamSpace Tools

在 DeepSeek Harness（DSH）里注册 **只读 Agent Tools**：用户对话提到项目/需求/Bug/待办时，模型按需调用工具；工具再请求 TeamSpace 后端（默认 `http://127.0.0.1:8090`），把 JSON 结果作为上下文返回给模型。

```
用户输入（DSH Web / Agent）
        │
        ▼
  模型决定调用 tool（按需）
        │
        ▼
  plugin-teamspace（本插件）
        │  Bearer / autoDevLogin
        ▼
  TeamSpace Server :8090
  GET /api/projects
  GET /api/requirements/{id}
  GET /api/projects/{id}/bugs
  GET /api/workspace
```

## 已注册工具（MVP · 只读）

| Tool | 作用 | 后端接口 |
|------|------|----------|
| `teamspace_list_projects` | 列出项目 | `GET /api/projects` |
| `teamspace_get_requirement` | 需求详情（可选时间线） | `GET /api/requirements/{id}` + `/timeline` |
| `teamspace_list_bugs` | 项目 Bug 列表（默认未关闭） | `GET /api/projects/{id}/bugs` |
| `teamspace_get_workspace` | 个人工作台摘要 | `GET /api/workspace` |

写操作（创建 Bug、状态流转等）按设计文档后续再加。

## 前置

1. TeamSpace 后端已启动：`cd server && make run`（默认 `8090`）
2. 本机已安装 `dsh` CLI
3. 开发鉴权二选一：
   - **推荐本地**：保持 `autoDevLogin: true`（服务端 `DEV_MODE=true`，走 `POST /api/auth/dev-login`）
   - 或在配置里填 `token`（浏览器登录后拿到的 Bearer）

## 安装

把下面路径换成你机器上的真实绝对路径（不要用占位符）：

```sh
dsh plugin --profile web add /data/code/document/dsh‑wps‑workflow/plugin-teamspace
dsh web
```

装成功后，`~/.dsh/profiles/web/package.json` 应同时满足：

1. `dependencies` 里有 `"@66hackathon/dsh-teamspace": "link:.../plugin-teamspace"`
2. `dsh.profile.bundles` 数组里有 `"@66hackathon/dsh-teamspace"`

若只有 `plugin-teamspace` 且 link 指向 `/absolute/path/to/...`，说明路径写错了，需要删掉错误依赖后重装。

> 本插件是 **Agent Tools**（无独立设置页）。装上后不会在「插件市场」里像 IM 渠道那样出现大卡片；请在对话里试「列出 TeamSpace 项目」，或在 Agent 可用工具列表里找 `teamspace_*`。

远端安装示例：

```sh
dsh plugin --profile web add github:66Hackathon/dsh-wps-workflow#path:plugin-teamspace
```

## 配置

`cordis.patch.yml` 默认：

```yaml
config:
  baseUrl: "http://127.0.0.1:8090"
  token: ""
  autoDevLogin: true
  devUserId: 1
  timeoutMs: 15000
```

安装进 profile 后，可在 profile 的 patch / 设置里覆盖。生产环境请关闭 `autoDevLogin`，改为显式 `token`。

## 试一下

在 DSH Web 对话里说：

- 「列出 TeamSpace 里有哪些项目」
- 「看一下需求 #1 的详情和时间线」
- 「项目 1 还有哪些未关闭的 Bug」
- 「我现在工作台上有什么待办」

模型应调用对应 `teamspace_*` 工具，并从 `:8090` 拉回数据。

## 开发说明

- 入口：`src/index.js`（`ctx.tools.register`，无额外 npm 依赖）
- HTTP：`src/client.js`
- 无构建步骤；`package.json` 声明 `dsh.bundle.patch`
- 不依赖 `@deepseek-ai/schemastery` / `dsh-tools`（link 安装时 Node 无法从 peer 解析它们）

## 与 plugin-im 的关系

| 目录 | 职责 |
|------|------|
| `plugin-im/` | WPS IM **渠道**：群聊/私聊驱动 Harness |
| `plugin-teamspace/` | Agent **Tools**：给模型按需注入 TeamSpace 业务上下文 |

二者可同时安装；IM 里提问时同样能调用这些 tools（只要当前 profile 已挂上本插件）。
