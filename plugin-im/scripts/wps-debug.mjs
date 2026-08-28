#!/usr/bin/env node
/**
 * WPS Echo 本地诊断工具（不打印 Secret）。
 *
 * 用法:
 *   node scripts/wps-debug.mjs verify          # 验证 App ID / Secret 能否换 token
 *   node scripts/wps-debug.mjs listen [秒]     # 独占 WebSocket 监听事件（需先停 dsh web）
 *   node scripts/wps-debug.mjs echo [秒]       # 监听并自动原样回复（完整 Echo 链路）
 *   node scripts/wps-debug.mjs simulate        # 本地模拟事件，不测网络
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { WpsTokenProvider } from '../src/channels/wps/wps-app.mjs';
import { WpsEventWebSocket } from '../src/channels/wps/wps-event-ws.mjs';
import { WpsApiClient } from '../src/channels/wps/wps-api.mjs';
import { createWpsEchoHandler } from '../src/channels/wps/wps-echo.mjs';
import {
  parseWpsChatMessageEvent,
  shouldHandleGroupMessage,
} from '../src/channels/wps/message-parser.mjs';
import { isWpsChatMessageCreate } from '../src/channels/wps/wps-event-ws.mjs';
import {
  encryptEventData,
  signEventContent,
  buildEventSignatureContent,
} from '../src/channels/wps/event-crypto.mjs';

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const configPath = join(dshHome, 'integrations', 'dsh-wps', 'config.json');
const credPath = join(dshHome, '.credentials.yaml');

async function loadSecret(ref) {
  const raw = await readFile(credPath, 'utf8');
  const match = raw.match(new RegExp(`^\\s*${ref}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

async function loadConfig() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const secret = await loadSecret(config.appSecretRef);
  if (!secret) throw new Error(`找不到凭据 ${config.appSecretRef}，请先在设置页保存 App Secret`);
  return { config, secret };
}

async function cmdVerify() {
  const { config, secret } = await loadConfig();
  console.log('App ID :', config.appId);
  console.log('通道   :', config.transport);
  const provider = new WpsTokenProvider({ appId: config.appId, appSecret: secret });
  const verified = await provider.verifyCredentials();
  console.log('Token  :', verified.accessTokenPreview, '✓');
  console.log('\n凭据有效。若仍无回复，请继续运行 listen 或 echo 子命令。');
}

function signedEvent(appId, appSecret, plain) {
  const nonce = 'aae1234567890abc';
  const encrypted_data = encryptEventData(plain, { appSecret, nonce });
  const event = {
    topic: 'kso.app_chat.message',
    operation: 'create',
    time: 1704074400,
    nonce,
    encrypted_data,
  };
  const content = buildEventSignatureContent({
    accessKey: appId,
    topic: event.topic,
    nonce: event.nonce,
    time: event.time,
    encryptedData: event.encrypted_data,
  });
  event.signature = signEventContent(content, appSecret);
  return event;
}

async function cmdSimulate() {
  const { config, secret } = await loadConfig();
  const plain = JSON.stringify({
    chat: { id: 'chat_simulate', type: 'group' },
    company_id: 'co_sim',
    message: {
      id: 'msg_simulate',
      type: 'text',
      content: { text: { content: '测试123' } },
      mentions: [{ identity: { id: config.appId, type: 'app' } }],
    },
    sender: { id: 'user_sim', type: 'user' },
  });
  const frame = signedEvent(config.appId, secret, plain);
  const parsed = parseWpsChatMessageEvent(plain);
  const handle = shouldHandleGroupMessage(parsed, { appId: config.appId });
  console.log('模拟消息解析:');
  console.log('  chatId      :', parsed.chatId);
  console.log('  text        :', parsed.text);
  console.log('  isAtBot     :', parsed.isAtBot);
  console.log('  shouldHandle:', handle);
  const sent = [];
  const handler = createWpsEchoHandler({
    appId: config.appId,
    api: {
      createTextMessage: async (payload) => {
        sent.push(payload);
        return { messageId: 'mock_reply' };
      },
    },
  });
  await handler({
    topic: frame.topic,
    operation: frame.operation,
    plain,
  });
  console.log('Echo 出站 payload:', JSON.stringify(sent[0], null, 2));
  console.log(handle ? '\n本地模拟通过 ✓' : '\n本地模拟失败：消息被过滤（检查 @ 机器人逻辑）');
}

async function cmdListen(mode, seconds) {
  const { config, secret } = await loadConfig();
  const provider = new WpsTokenProvider({ appId: config.appId, appSecret: secret });
  await provider.verifyCredentials();

  const api = mode === 'echo'
    ? new WpsApiClient({ tokenProvider: provider })
    : null;
  const onEvent = mode === 'echo'
    ? createWpsEchoHandler({ api, appId: config.appId, logger: console })
    : async (event) => {
      console.log('  event code=%s.%s bytes=%d',
        event.topic, event.operation, event.plain?.length ?? 0);
      if (isWpsChatMessageCreate(event)) {
        const parsed = parseWpsChatMessageEvent(event.plain);
        const handle = shouldHandleGroupMessage(parsed, { appId: config.appId });
        console.log('    chatId=%s text=%j isAtBot=%s shouldHandle=%s',
          parsed?.chatId, parsed?.text?.slice(0, 80), parsed?.isAtBot, handle);
        if (!handle) {
          console.log('    mentions:', JSON.stringify(parsed?.raw?.message?.mentions ?? []));
        }
      }
    };

  console.log(`\n正在连接 WebSocket，监听 ${seconds}s …`);
  console.log('⚠  同一 App ID 只能有一个 WebSocket 连接。请先停止 dsh web，或点设置页「移除配置」。');
  console.log(`   然后在 WPS 协作群 @ 机器人发送「测试123」\n`);

  let eventCount = 0;
  const socket = new WpsEventWebSocket({
    appId: config.appId,
    appSecret: secret,
    onEvent: async (event) => {
      eventCount += 1;
      try {
        await onEvent(event);
      } catch (error) {
        console.error('  处理失败:', error.message);
      }
    },
    logger: console,
  });

  try {
    await socket.connect();
    console.log('已连接，等待消息…');
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  } finally {
    await socket.close();
  }

  console.log(`\n结束。共收到 ${eventCount} 个事件。`);
  if (eventCount === 0) {
    console.log(`
排查清单:
  1. WPS 开放平台 → 事件与回调 → 开启 WebSocket 事件推送
  2. 订阅事件: kso.app_chat.message (create)
  3. 机器人已加入测试群，且在应用可见范围内
  4. 群聊里必须 @ 机器人（不是普通发消息）
  5. 确认没有第二个进程占用同一 App ID 的 WebSocket（dsh web / 其他脚本）
`);
  }
}

const [command = 'help', arg] = process.argv.slice(2);

try {
  if (command === 'verify') {
    await cmdVerify();
  } else if (command === 'listen') {
    await cmdListen('listen', Number(arg) || 60);
  } else if (command === 'echo') {
    await cmdListen('echo', Number(arg) || 60);
  } else if (command === 'simulate') {
    await cmdSimulate();
  } else {
    console.log(`WPS Echo 诊断工具

命令:
  verify            验证凭据能否换取 access_token
  simulate          本地模拟收消息 + Echo（不需要 WPS / 网络）
  listen [秒]       独占 WebSocket，只打印收到的事件（默认 60s）
  echo [秒]         独占 WebSocket，收到 @ 消息后原样回复（默认 60s）

示例:
  npm run wps:verify
  npm run wps:simulate
  npm run wps:listen -- 120
  npm run wps:echo -- 120

注意: listen/echo 会抢占 dsh web 的 WebSocket 连接，测完需重启 dsh web。
`);
  }
} catch (error) {
  console.error('错误:', error.message);
  process.exit(1);
}
