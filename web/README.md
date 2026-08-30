# DSH TeamSpace 独立 Web 前端

TeamSpace 项目空间的独立 SPA，不依赖 DeepSeek Harness Web 或 DSH 插件。

## 技术栈

- Vite + React + TypeScript
- 默认中文界面
- 开发时通过 Vite 代理访问 Go API（`/api`、`/healthz`）

## 启动

```sh
# 终端 1：MySQL + API（见 ../server/README.md）
cd ../server && make docker-up && make run

# 终端 2：前端
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173

## 环境

| 变量 | 默认 | 说明 |
|------|------|------|
| `TEAMSPACE_API_URL` | `http://127.0.0.1:8090` | Vite 代理目标（仅 dev） |

## WPS 登录

在 `server/.env` 配置 OAuth。WPS 开放平台「用户授权回调」须与后端一致：

`http://127.0.0.1:8090/api/auth/callback`

## 界面

- 登录后默认展示 **项目列表**，点击「创建项目」进入协作流程 Demo
- 创建流程中 **步骤 1** 已打通；步骤 2～6 标注暂未开放

登录流程：

1. 点击「使用 WPS 登录」→ `GET /api/auth/login` 返回 `{ client_id, state, redirect_url }`
2. 前端跳转 WPS 授权页
3. WPS 回调后端 `/api/auth/callback`，后端校验 state、写入用户、重定向 `http://127.0.0.1:5173/?token=...`
4. 前端将 token 存入 `localStorage`，后续请求带 `Authorization: Bearer`

## 构建

```sh
npm run build
npm run preview
```

生产部署可将 `dist/` 静态资源与 Go API 同域托管，或配置反向代理将 `/api` 转发到业务服务。
