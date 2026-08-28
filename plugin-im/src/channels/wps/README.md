# WPS 协作 — 运行说明

当前为 **Harness 模式**：群聊 @ 机器人或私聊发消息 → 驱动本机 DeepSeek Harness 回答（流式卡片，失败时降级为文本）。

> Echo 原样回复仍可通过配置 `mode: "echo"` 启用，供联调使用。

## 前置

- [365 开放平台](https://365.kdocs.cn/3rd/open/developer/home) 企业自建应用：**App ID** + **App Secret**
- 开通 IM / 发消息权限，机器人入群，测试账号在可见范围内

## 从 GitHub 试用

WPS 渠道在尚未发布到 npm 的版本里，需用 GitHub 源安装 **dsh-im**（会替换当前 profile 里已有的 `@xmanrui/dsh-im`）。

**不克隆，直接安装**

```sh
dsh plugin --profile web add -w github:newbirdcoming/dsh-im
```

仓库：[https://github.com/newbirdcoming/dsh-im](https://github.com/newbirdcoming/dsh-im)（SSH：`git@github.com:newbirdcoming/dsh-im.git`）

等价封装（内部也是调上面的 `dsh plugin`）：

```sh
npx -y github:newbirdcoming/dsh-im install
```

**先克隆再装本地目录**（改代码时用）

```sh
git clone git@github.com:newbirdcoming/dsh-im.git
cd dsh-im
npm install
npm run build                    # 建议执行，确保 lib/ 是最新的
node bin/dsh-im.mjs install --source .
```

安装后 **重启** `dsh web` / Harness Host，打开 **设置 → IM机器人 → WPS 协作**。

> 同一 profile 只会加载一份 dsh-im；`install` 是覆盖安装，不是与 npm 版并行。恢复稳定版：`dsh plugin --profile web add -w @xmanrui/dsh-im` 后重启。



## 启动 Echo

1. 填写 App ID、App Secret
2. **事件通道** 选 **WebSocket**（默认，本地免 tunnel）或 **HTTP 回调**（需 ngrok 等暴露 `127.0.0.1:18765/wps/events` 并填入 WPS 后台）
3. **保存并启动** → 状态为「Harness 已连接」
4. 在 WPS 协作群 **@ 机器人** 提问，或使用 `/help` 查看命令

Secret 已保存后，改通道可留空 Secret 再保存。

## 快捷指令

在 WPS 协作里 **@ 机器人**（群聊）或 **私聊** 直接发送下列命令。普通提问不用加命令，发文字/图片/文件即可续聊当前会话。

发送 **`/help`** 可在聊天里查看完整说明。

### 会话与上下文

| 命令 | 说明 |
|------|------|
| `/new` | 开启全新 Harness 会话（当前聊天与旧 Session 解绑，下一条消息新建） |
| `/compact` | 压缩当前会话较早上下文（上下文快满时优先试这个） |
| `/history [数量]` | 查看最近历史（默认 3 条，最多 5 条） |
| `/stop` | 停止当前正在执行的任务 |
| `/steer 补充指令` | 向当前任务发送纠偏指令 |

### 工作区与会话绑定

| 命令 | 说明 |
|------|------|
| `/workspace 工作区绝对路径` | 切换本机器人的工作区（会清空所有聊天的 Session 绑定） |
| `/workspacelist` | 列出可选工作区绝对路径 |
| `/sessionlist [工作区序号或绝对路径]` | 列出工作区内的 Session ID 与标题 |
| `/session Session ID` 或 `/session N` | 将**当前聊天**绑定到指定 Session（`N` 为当前工作区会话列表序号） |

工作区路径持久化在 `~/.dsh/integrations/dsh-wps/workspaces.json`；每个群/私聊的 Session 绑定在 `state.json`（键为 `group:<chat_id>` 或 `direct:<chat_id>`）。

### 模型与 Agent Preset

| 命令 | 说明 |
|------|------|
| `/models` | 按序号列出可用模型 |
| `/model [序号或完整模型 ID] [推理等级 ID]` | 查看或切换当前会话模型 |
| `/reasoninglist` 或 `/reasonings` | 列出当前模型可用推理等级 |
| `/reasoning [序号、等级 ID 或 --default]` | 查看或切换推理等级 |
| `/presetlist` | 按序号列出 Agent Preset |
| `/preset [序号或完整 ID]` | 查看或设置当前机器人 Preset |
| `/preset id:<ID>` | 使用纯数字等形式指定 Preset ID |
| `/preset --default` | 跟随 Host 默认 Preset |

示例：先发 `/models`，再发 `/model 2`；需要推理等级时再带第二个参数。

### 批量输入（仅私聊）

| 命令 | 说明 |
|------|------|
| `/batch` | 开始批量输入（最多 10 条文字） |
| `/send` | 提交当前批次 |
| `/cancel` | 取消当前批次 |

群聊不支持 `/batch`。

### 状态与其它

| 命令 | 说明 |
|------|------|
| `/status` | 检查机器人与 Harness 连接是否正常 |
| `/version` | 查看插件版本 |
| `/help` | 显示命令帮助 |

### 与飞书的差异

- WPS **没有**飞书菜单卡片，以上均需 **文本命令**（或私聊直接发）。
- **群聊**里发命令也需要 **@ 机器人**（与提问相同）。
- **不会自动**执行 `/compact`；上下文满了需手动 `/compact` 或 `/new`。
- **撤回消息**、机器人主动撤回回复：**当前未实现**；要中断生成请用 `/stop`。

## 诊断与测试命令

在仓库根目录执行。`verify` / `listen` / `echo` 会读取 `~/.dsh/integrations/dsh-wps/config.json` 与 Host 凭据存储里的 App Secret（需先在设置页保存过一次，或手动写好配置）。

```sh
# 单元测试（不连 WPS）
npm run test:wps

# 验证 App ID / Secret 能否换取 access_token
npm run wps:verify

# 直连 OpenAPI 测试流式卡片 create + update（不依赖 Harness）
DSH_WPS_DEBUG=1 node scripts/wps-stream-test.mjs

# 本地模拟收消息 + Echo（不需要 WPS / 网络）
npm run wps:simulate

# 独占 WebSocket，只打印收到的事件（默认 60s）
npm run wps:listen
npm run wps:listen -- 120    # 监听 120 秒

# 独占 WebSocket，收到消息后自动原样回复（完整 Echo 链路）
npm run wps:echo
npm run wps:echo -- 120
```

等价于直接调用脚本：

```sh
node scripts/wps-debug.mjs verify
node scripts/wps-debug.mjs simulate
node scripts/wps-debug.mjs listen [秒]
node scripts/wps-debug.mjs echo [秒]
```

**注意：**

- 运行 `listen` / `echo` 前请先 **停止 `dsh web`**，并在设置页移除 Echo 或确保没有第二个进程占用同一 App ID 的 WebSocket，否则会互踢。
- `simulate` / `test:wps` 可在未配置凭据时运行；其余命令需要已保存的 App ID / Secret。
- 若 `npm run build` 报找不到 `esbuild`，先执行 `npm install`（`esbuild` 在 devDependencies 里）。

## 注意

- **收消息**：WebSocket 或 HTTP 二选一，设置页切换即可，无需改代码。  
- **发消息**：始终走 OpenAPI `POST /v7/messages/create`，与入站方式无关。  
- **同一 App ID 不要多处同时连事件**（如本机 + 远程服务器都开 WebSocket），否则可能互踢，只一端能收消息。联调时停远程或单独建测试应用。  
- 配置落在 `~/.dsh/integrations/dsh-wps/config.json`；Secret 在 Host 凭据存储，不在配置文件里。
- **工作区**默认与 Slack/飞书相同：Host 启动时的 `process.cwd()`，持久化在 `~/.dsh/integrations/dsh-wps/workspaces.json`；可在聊天中用 `/workspace`、`/workspacelist` 切换（详见上文「快捷指令」）。

实现细节见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。