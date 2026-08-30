# DSH TeamSpace（WPS Workflow）

在 DSH 生态之外交付 **TeamSpace 项目空间**：独立 Web 前端 + Go 业务服务 + MySQL。

| 目录 | 说明 |
|------|------|
| [`web/`](web/) | 独立 React SPA（项目空间 UI，中文） |
| [`server/`](server/) | Go REST API、WPS OAuth、MySQL |
| [`plugin-im/`](plugin-im/) | DSH 插件：WPS IM 机器人渠道 |
| [`deepseek-harness/`](deepseek-harness/) | DeepSeek Harness 上游源码（可选） |

**第一版不依赖 `dsh web`**。后续 AI 能力由 `server/` 集成 Harness SDK，而非嵌入 DSH 前端。

架构分步说明见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 快速开始

```sh
# 1. 业务 API + MySQL
cd server
cp .env.example .env   # 填入 WPS OAuth
make docker-up
make run

# 2. 前端
cd ../web
npm install
npm run dev
```

打开 http://127.0.0.1:5173 ，使用 WPS 企业账号登录。

## WPS OAuth

- 回调（填在 WPS 开放平台）：`http://127.0.0.1:8090/api/auth/callback`
- 登录成功后跳回：`http://127.0.0.1:5173`

详见 [`server/README.md`](server/README.md) 与 [`web/README.md`](web/README.md)。

## 仓库

https://github.com/66Hackathon/dsh-wps-workflow
