# WPS 协作 — 运行说明

WPS 协作 IM 机器人插件，用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：群聊 @ 机器人或私聊发消息 → 驱动本机 Harness 回答（流式卡片，失败时降级为文本）。

**仓库：** [66Hackathon/dsh-wps-workflow](https://github.com/66Hackathon/dsh-wps-workflow)  
**插件目录：** `plugin-im/`（本 README 所在目录）

当前为 **Harness 模式**。Echo 原样回复仍可通过配置 `mode: "echo"` 启用，供联调使用。

## 前置

- [365 开放平台](https://365.kdocs.cn/3rd/open/developer/home) 企业自建应用：**App ID** + **App Secret**
- 开通 IM / 发消息权限，机器人入群，测试账号在可见范围内
- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，且 `dsh` 在 PATH 中

## 安装

本插件包名为 `@66hackathon/dsh-wps`（DSH 用来识别插件的唯一 ID，与 GitHub 组织 `66Hackathon` 对应）。仓库已提交预构建的 `lib/`，**无需 clone、无需 `npm install`、无需 `npm run build`**。

### 安装

```sh
dsh plugin --profile web add github:66Hackathon/dsh-wps-workflow#path:plugin-im
dsh web
```

然后在 **设置 → WPS 协作** 填写 App ID / Secret，保存并启动。

> 因插件位于仓库的 `plugin-im/` 子目录，命令里需要 `#path:plugin-im`。若将来把 `package.json` 放到仓库根目录，可简化为 `github:66Hackathon/dsh-wps-workflow`。

### 等价封装

```sh
npx -y github:66Hackathon/dsh-wps-workflow#path:plugin-im install
dsh web
```



### 本地改代码时（仅开发者）

只有你要修改插件源码时才需要 clone 和 build：

```sh
git clone git@github.com:66Hackathon/dsh-wps-workflow.git
cd dsh-wps-workflow/plugin-im
npm install
npm run build
dsh plugin --profile web add /path/to/dsh-wps-workflow/plugin-im
dsh web
```

## 启动

1. 填写 App ID、App Secret
2. **事件通道** 选 **WebSocket**（默认，本地免 tunnel）或 **HTTP 回调**（需 ngrok 等暴露 `127.0.0.1:18765/wps/events` 并填入 WPS 后台）
3. **保存并启动** → 状态为「Harness 已连接」
4. 在 WPS 协作群 **@ 机器人** 提问，或使用 `/help` 查看命令

Secret 已保存后，改通道可留空 Secret 再保存。

## 快捷指令

在 WPS 协作里 **@ 机器人**（群聊）或 **私聊** 直接发送下列命令。普通提问不用加命令，发文字/图片/文件即可续聊当前会话。

发送 `/help` 可在聊天里查看完整说明。

### 会话与上下文


| 命令              | 说明                                         |
| --------------- | ------------------------------------------ |
| `/new`          | 开启全新 Harness 会话（当前聊天与旧 Session 解绑，下一条消息新建） |
| `/compact`      | 压缩当前会话较早上下文（上下文快满时优先试这个）                   |
| `/history [数量]` | 查看最近历史（默认 3 条，最多 5 条）                      |
| `/stop`         | 停止当前正在执行的任务                                |
| `/steer 补充指令`   | 向当前任务发送纠偏指令                                |


### 工作区与会话绑定


| 命令                                   | 说明                                       |
| ------------------------------------ | ---------------------------------------- |
| `/workspace 工作区绝对路径`                 | 切换本机器人的工作区（会清空所有聊天的 Session 绑定）          |
| `/workspacelist`                     | 列出可选工作区绝对路径                              |
| `/sessionlist [工作区序号或绝对路径]`          | 列出工作区内的 Session ID 与标题                   |
| `/session Session ID` 或 `/session N` | 将**当前聊天**绑定到指定 Session（`N` 为当前工作区会话列表序号） |


工作区路径持久化在 `~/.dsh/integrations/dsh-wps/workspaces.json`；每个群/私聊的 Session 绑定在 `state.json`（键为 `group:<chat_id>` 或 `direct:<chat_id>`）。

### 模型与 Agent Preset


| 命令                                  | 说明                   |
| ----------------------------------- | -------------------- |
| `/models`                           | 按序号列出可用模型            |
| `/model [序号或完整模型 ID] [推理等级 ID]`     | 查看或切换当前会话模型          |
| `/reasoninglist` 或 `/reasonings`    | 列出当前模型可用推理等级         |
| `/reasoning [序号、等级 ID 或 --default]` | 查看或切换推理等级            |
| `/presetlist`                       | 按序号列出 Agent Preset   |
| `/preset [序号或完整 ID]`                | 查看或设置当前机器人 Preset    |
| `/preset id:<ID>`                   | 使用纯数字等形式指定 Preset ID |
| `/preset --default`                 | 跟随 Host 默认 Preset    |


示例：先发 `/models`，再发 `/model 2`；需要推理等级时再带第二个参数。

### 批量输入（仅私聊）


| 命令        | 说明                |
| --------- | ----------------- |
| `/batch`  | 开始批量输入（最多 10 条文字） |
| `/send`   | 提交当前批次            |
| `/cancel` | 取消当前批次            |


群聊不支持 `/batch`。

### 状态与其它


| 命令         | 说明                    |
| ---------- | --------------------- |
| `/status`  | 检查机器人与 Harness 连接是否正常 |
| `/version` | 查看插件版本                |
| `/help`    | 显示命令帮助                |


## 注意

- **收消息**：WebSocket 或 HTTP 二选一，设置页切换即可，无需改代码。  
- **发消息**：始终走 OpenAPI `POST /v7/messages/create`，与入站方式无关。  
- **同一 App ID 不要多处同时连事件**（如本机 + 远程服务器都开 WebSocket），否则可能互踢，只一端能收消息。联调时停远程或单独建测试应用。  
- 配置落在 `~/.dsh/integrations/dsh-wps/config.json`；Secret 在 Host 凭据存储，不在配置文件里。
- **工作区**默认与 Slack/飞书相同：Host 启动时的 `process.cwd()`，持久化在 `~/.dsh/integrations/dsh-wps/workspaces.json`；可在聊天中用 `/workspace`、`/workspacelist` 切换（详见上文「快捷指令」）。

