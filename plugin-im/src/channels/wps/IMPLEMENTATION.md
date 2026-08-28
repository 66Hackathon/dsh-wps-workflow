# WPS 365 企业应用渠道 — 分步实现说明

> 目标：在 dsh-im 中新增 WPS 协作「应用机器人」渠道，使用户在 WPS 里 @ 机器人即可驱动本机 DeepSeek Harness。
>
> 更新：2026-08-28  
> **运行与联调**见同目录 [README.md](./README.md)。

## 当前进度


| 步骤                           | 状态               | 产物                                                                 |
| ---------------------------- | ---------------- | ------------------------------------------------------------------ |
| 0. WPS 开发者后台配置               | 人工               | App ID / Secret、权限、事件订阅 URL                                        |
| 1. `wps-app` 应用鉴权            | **已完成**          | `wps-app.mjs`、`kso-sign.mjs`                                       |
| 2. `event-crypto` 事件验签解密     | **已完成**          | `event-crypto.mjs`、`message-parser.mjs`                            |
| 3. `callback-server` 入站 HTTP | **已完成**          | `callback-server.mjs`；另提供 `wps-event-ws.mjs`（WebSocket，本地免 tunnel） |
| 4. Echo 联调（收→原样回）            | **已完成**          | `wps-echo.mjs` + `wps-echo-controller.mjs` + Host 插件               |
| 5. `wps-api` 发消息 / 更新消息      | **已完成**          | `wps-api.mjs`（create / update card）                                |
| 6. `wps-bridge` + Harness    | **已完成**          | `wps-bridge.mjs`、`wps-runtime.mjs`、`wps-controller.mjs`、`harness-client.mjs`、`state-store.mjs` |
| 7. `wps-streaming-card` 流式卡片 | **已完成草稿**        | `wps-streaming-card.mjs` + 单测                                      |
| 8. 设置页 UI（client）            | **已完成 Echo MVP** | `plugin-src/client/channels/wps/`                                  |
| 9. Host 插件注册（host）           | **已完成**          | `plugin-src/host/channels/wps/`                                    |
| 10. 端到端验收                    | 待真机              | 配置 App ID/Secret → @ 机器人发文本                                        |


**已完成代码：**

- `src/channels/wps/kso-sign.mjs` — KSO-1 签名
- `src/channels/wps/wps-app.mjs` — `client_credentials` token 缓存
- `src/channels/wps/event-crypto.mjs` — 事件验签 / 解密 / challenge
- `src/channels/wps/message-parser.mjs` — IM 事件解析与 @ 过滤
- `src/channels/wps/wps-api.mjs` — 发消息 / 更新卡片
- `src/channels/wps/callback-server.mjs` — HTTP 回调服务
- `src/channels/wps/wps-event-ws.mjs` — WebSocket 事件通道（推荐本地开发）
- `src/channels/wps/wps-echo.mjs` — Echo 处理器
- `src/channels/wps/wps-echo-controller.mjs` — Echo 控制器（WS/HTTP 双通道）
- `src/channels/wps/config-store.mjs` — 本机配置持久化
- `src/channels/wps/protocol.mjs` — RPC 协议常量
- `plugin-src/host/channels/wps/` — Host 插件（production / rpc / index）
- `plugin-src/client/channels/wps/` — 设置页（App ID/Secret、通道选择、状态）
- `src/channels/wps/wps-streaming-card.mjs` — 流式卡片草稿
- `test/channels/wps/*.test.mjs` — 单元测试

- `src/channels/wps/wps-controller.mjs` — Harness / Echo 控制器
- `src/channels/wps/wps-runtime.mjs` — 事件通道 + Bridge
- `src/channels/wps/wps-bridge.mjs` — TextHarnessBridge 适配
- `src/channels/wps/harness-client.mjs` — Harness RPC 客户端
- `src/channels/wps/state-store.mjs` — 会话绑定与去重

---



## 架构对照

WPS 企业应用与 dsh-im 现有渠道的差异：

```
飞书 / 钉钉 / 企微     WPS 企业应用（本渠道）
─────────────────     ─────────────────────
长连接 / Stream 收消息   事件订阅 HTTP 回调收消息
扫码或 Token 接入        App ID + App Secret 手动接入
平台原生流式卡片         卡片 + update-msg 全量刷新（见步骤 7）
```

可参考的现有实现：


| 能力           | 参考渠道           | 参考文件                                                              |
| ------------ | -------------- | ----------------------------------------------------------------- |
| 凭据表单 UI      | Slack          | `plugin-src/client/channels/shared/token-channel.js`              |
| 事件回调 / 解密    | 飞书回调修复         | `src/channels/feishu/repair-manager.mjs`                          |
| Harness 消息处理 | 多渠道路由          | `src/channels/shared/text-harness-bridge.mjs`                     |
| 流式呈现         | 飞书卡片流          | `src/channels/feishu/feishu-channel.mjs`                          |
| 出站连接型集成      | AI Office      | `src/channels/office/office-runtime.mjs`（模式不同，仅作 Controller 结构参考） |
| Host 插件骨架    | Office / Slack | `plugin-src/host/channels/office/`                                |


---



## 步骤 0：WPS 开发者后台（人工）

**目的：** 拿到凭据，并保证平台能把 IM 事件推到你的服务。

1. 登录 [365 开放平台](https://365.kdocs.cn/3rd/open/developer/home)，创建 **企业自建应用**。
2. 开通 IM / 协作机器人相关权限（至少包含发消息、读消息类 scope，如 `kso.chat_message.readwrite`）。
3. 配置 **应用可见范围**（包含测试用户与群）。
4. 在「事件与回调」配置订阅地址（步骤 3 跑通后再填真实 HTTPS URL）。
5. 订阅 IM 消息相关事件（@ 机器人、单聊等，以开放平台当前事件列表为准）。
6. 记录 **App ID**、**App Secret**。

**验收：** 后台应用状态为已发布/可用，权限与事件已开通。

**文档：**

- [应用机器人](https://365.kdocs.cn/3rd/open/documents/app-integration-dev/guide/robot/app)
- [事件订阅流程](https://365.kdocs.cn/3rd/open/documents/app-integration-dev/wps365/server/event-subscription/subscription-flow)
- [事件安全校验](https://365.kdocs.cn/3rd/open/documents/app-integration-dev/wps365/server/event-subscription/security-verification)

---



## 步骤 1：`wps-app.mjs` — 应用鉴权

**目的：** 用 App ID + App Secret 换取并缓存 `access_token`，供发消息 API 使用。

**建议文件：** `src/channels/wps/wps-app.mjs`

**实现要点：**

- 调用 WPS 开放平台 token 接口（企业应用凭证，**不是**用户 `wps_sid`）。
- 内存 + 可选持久化缓存；在过期前刷新。
- 请求 openapi 时使用 `Authorization: Bearer {access_token}`。
- 出站请求签名使用 **KSO-1**（与事件回调验签算法不同，需单独实现）。

**参考：** `src/channels/feishu/feishu-app.mjs` 的 `verifyFeishuApp`（验证凭据 + 读 bot 身份）。

**验收：** 给定合法 App ID/Secret，能拿到 token；非法凭据抛出明确错误。

**单测：** `test/channels/wps/wps-app.test.mjs`（mock HTTP）。

---



## 步骤 2：`event-crypto.mjs` — 事件验签与解密

**目的：** 安全处理 WPS 推到回调地址的加密事件。

**建议文件：** `src/channels/wps/event-crypto.mjs`

**实现要点：**

1. **Challenge 验证：** 首次配置 URL 时，原样返回 `challenge`（1 秒内）。
2. **验签：** `content = access_key:topic:nonce:time:encrypted_data`，HMAC-SHA256，密钥为 App Secret。
3. **解密：** `encrypted_data` 用 AES-CBC，key 为 `MD5(app_secret)`，IV 为 `nonce`。
4. 解析解密后的 JSON，提取 IM 消息字段（`chat_id`、发送者、正文、是否 @ 机器人等）。

**验收：** 使用官方文档示例向量或 mock payload，验签/解密结果与文档一致。

**单测：** `test/channels/wps/event-crypto.test.mjs`。

---



## 步骤 3：`callback-server.mjs` — 入站 HTTP 服务

**状态：** 已实现；并补充 `wps-event-ws.mjs` 作为本地开发替代方案。

**目的：** 接收 WPS 事件。除 HTTP 回调外，WPS 还提供 `wss://openapi.wps.cn/v7/event/ws` WebSocket 事件通道，**本地开发可优先用 WebSocket，免公网 tunnel**。

**建议文件：**

- `src/channels/wps/callback-server.mjs` — HTTP challenge + 加密事件
- `src/channels/wps/wps-event-ws.mjs` — WebSocket 事件（KSO-1 握手 + ack）

**建议文件：** `src/channels/wps/callback-server.mjs`

**实现要点：**

- 使用 Node `http.createServer` 或 Harness Host 提供的 HTTP 挂载点（若有）。
- 默认监听 `127.0.0.1:{port}/wps/events`（端口可配置）。
- 路由：
  - `POST /wps/events` → 步骤 2 解密 → 分发到 Bridge（步骤 4/6）。
- **3 秒内**返回 HTTP 200（WPS 重试策略要求）。
- 重活（调 Harness）应异步，不要阻塞 HTTP 响应。

**公网暴露（开发期）：**

- cloudflared / ngrok 等 tunnel，或公司反向代理。
- 设置页展示「请将此 URL 填入 WPS 后台」。

**验收：** 用 curl 模拟 challenge；tunnel 连通后 WPS 后台 URL 验证通过。

---



## 步骤 4：Echo 联调 — 收消息原样回

**目的：** 在接 Harness 之前，验证「收 → 发」全链路，隔离平台配置问题。

**建议文件：** 临时逻辑可写在 `src/channels/wps/wps-echo.mjs` 或 Bridge 的 `echoMode` 开关。

**流程：**

```
用户 @ 机器人："测试123"
  → callback-server 收到事件
  → event-crypto 解密
  → 调 wps-api 在同 chat 回复 "测试123"
```

**验收：** WPS 协作里 @ 机器人，收到相同文本回复。此时尚未连接 DeepSeek Harness。

---



## 步骤 5：`wps-api.mjs` — 发消息 / 更新消息

**目的：** 封装 OpenAPI 调用，供 Echo、Bridge、流式卡片使用。

**建议文件：** `src/channels/wps/wps-api.mjs`

**核心接口：**


| API                                        | 用途              |
| ------------------------------------------ | --------------- |
| `POST /v7/chats/{chat_id}/messages/create` | 发 text / card 等 |
| `POST /v7/messages/{message_id}/update`    | **仅 card**，流式刷新 |
| （按需）撤回、上传文件等                               | 后续步骤            |


**实现要点：**

- 统一 KSO-1 签名 + Bearer token。
- `createMessage(chatId, payload)`、`updateMessage(messageId, payload)` 返回 `message_id`。
- 错误码映射为用户可读文案（权限不足、限流等）。

**验收：** 能对指定 `chat_id` 发 text；能对 `message_id` 更新 card。

**单测：** `test/channels/wps/wps-api.test.mjs`。

---



## 步骤 6：`wps-bridge.mjs` + Harness 集成

**目的：** 把 WPS 消息纳入 dsh-im 统一语义，驱动本机 Harness。

**建议文件：**

- `src/channels/wps/wps-bridge.mjs`
- `src/channels/wps/harness-client.mjs`（或复用 `src/channels/shared/harness-client.mjs`）
- `src/channels/wps/state-store.mjs` / `config-store.mjs`
- `src/channels/wps/wps-controller.mjs`

**实现要点：**

1. **会话路由：** `chat_id`（+ 可选 thread）→ Harness Session 绑定（参考 `src/channels/shared/harness-session-binding.mjs`）。
2. **入站过滤：** 群聊默认仅 @ 机器人时响应（可参考 `src/channels/feishu/group-response-mode.mjs`）。
3. **命令：** 复用 `text-harness-bridge.mjs` 处理 `/help`、`/new`、`/stop` 等。
4. **出站：** Bridge 实现 `openStream()` / `sendText()`，内部调用步骤 7。
5. **Controller：** 多机器人、凭据、工作区、Agent Preset（参考 Slack `slack-controller.mjs`）。

**验收：** @ 机器人提问，收到 Harness 回答（可先纯文本，再接流式卡片）。

---



## 步骤 7：`wps-streaming-card.mjs` — 流式卡片（已完成草稿）

**状态：** 已实现。

**文件：** `src/channels/wps/wps-streaming-card.mjs`

**与飞书差异：**


| 飞书                                     | WPS                                      |
| -------------------------------------- | ---------------------------------------- |
| `cardkit` + `cardElement.content` 增量更新 | `update-msg` 全量刷新整张 card                 |
| `streaming_mode: true`                 | 无；应用侧 `setContentThrottled` 节流（默认 500ms） |
| 28k 字符上限                               | 15k 字符上限                                 |


**用法：**

```javascript
import { createWpsStreamingSession } from './wps-streaming-card.mjs';

const session = createWpsStreamingSession({
  sendCard: (payload) => wpsApi.createMessage(chatId, payload),
  updateCard: (messageId, payload) => wpsApi.updateMessage(messageId, payload),
});
const { controller } = await session.begin();
await controller.setContentThrottled(partialMarkdown);
await controller.finish(finalMarkdown);
```

**验收：** 单测已通过；真机需步骤 5 完成后压测 update 频率与限流。

**降级：** update 失败或限流 → 最终一条 `type: text` 消息（WhatsApp 模式）。

---



## 步骤 8：设置页 UI（client）

**目的：** 在 dsh-im「IM 机器人」设置入口增加 WPS 渠道。

**建议目录：** `plugin-src/client/channels/wps/`


| 文件          | 内容                                        |
| ----------- | ----------------------------------------- |
| `index.js`  | 凭据面板：App ID、App Secret；显示回调 URL、tunnel 说明 |
| `api.js`    | RPC 端点常量                                  |
| `styles.js` | 渠道样式                                      |


**参考：** `plugin-src/client/channels/slack/index.js`（双字段凭据 + 引导文案）。

**注册：** `plugin-src/client/index.js` 的 `CHANNELS` 数组与 Tab 路由。

**验收：** 设置页可保存凭据、显示连接状态、复制回调地址。

---



## 步骤 9：Host 插件注册（host）

**目的：** 在 DSH Host 进程内启动 WPS Controller 与回调服务。

**建议目录：** `plugin-src/host/channels/wps/`


| 文件               | 内容                              |
| ---------------- | ------------------------------- |
| `index.mjs`      | Cordis `apply` 入口               |
| `production.mjs` | 组装 Controller、credentials、paths |
| `rpc.mjs`        | 状态 RPC（`/wps` channel）          |


**注册：** `plugin-src/host/index.mjs` 的 `channels` 列表。

**数据目录：** `~/.dsh/integrations/dsh-wps/`（`config.json`、`state.json`、`workspaces.json`）。

**验收：** 安装插件后 Host 日志出现 `dsh-wps` 启动；RPC 可查询状态。

---



## 步骤 10：端到端验收清单

- [ ] WPS 后台 URL 验证通过
- [ ] 群聊 @ 机器人 → Echo 原样回复
- [ ] @ 机器人 → Harness 文本回答
- [ ] 卡片流式更新可见（或明确降级为终态文本）
- [ ] `/new`、`/help` 等控制命令可用
- [ ] 移除接入后本机凭据与配置清理
- [ ] `npm run check` 全量通过

---



## 推荐实施顺序

```
0 后台配置
 ↓
1 wps-app ──→ 5 wps-api
 ↓              ↓
2 event-crypto  4 echo ──→ 6 bridge ──→ 7 streaming-card（已草稿）
 ↓                              ↓
3 callback-server          8 client UI + 9 host
 ↓
10 E2E
```

步骤 1+2+3+4 可并行于步骤 7；步骤 6 依赖 4 与 5；步骤 8/9 与 6 后期合并。

---



## 常见误区

1. **不要用** `wps_sid`**（用户 Cookie）做机器人** — 那是用户态 API（如 Cursor SKILL），不是企业应用机器人。
2. **不要照搬飞书扫码接入** — WPS 无 `registerApp`，需手动填 App ID/Secret。
3. **Echo 不是最终产品** — 只为验证回调与发消息；Harness 集成在步骤 6。
4. **流式不依赖入站方式** — 回调收消息与卡片 update 发流式是两条独立链路。

---



## 相关链接

- [WPS 卡片结构](https://open.wps.cn/documents/app-integration-dev/guide/card/card-structure)
- [发送消息](https://open.wps.cn/documents/app-integration-dev/wps365/server/im/message/single-create-msg)
- [更新消息](https://open.wps.cn/documents/app-integration-dev/wps365/server/im/message/update-msg)
- dsh-im 架构决策：[docs/adr/0001-semantic-core-native-channel-adapters.md](../../../docs/adr/0001-semantic-core-native-channel-adapters.md)

