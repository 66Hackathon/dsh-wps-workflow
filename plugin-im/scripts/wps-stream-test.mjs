#!/usr/bin/env node
/**
 * 直连 WPS OpenAPI 测试流式卡片 create + update（不依赖 dsh web / Harness）。
 *
 *   DSH_WPS_DEBUG=1 node scripts/wps-stream-test.mjs [chatId]
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { WpsTokenProvider } from '../src/channels/wps/wps-app.mjs';
import { WpsApiClient } from '../src/channels/wps/wps-api.mjs';
import {
  createWpsStreamingSession,
  DEFAULT_INITIAL_TEXT,
} from '../src/channels/wps/wps-streaming-card.mjs';

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const configPath = join(dshHome, 'integrations', 'dsh-wps', 'config.json');
const statePath = join(dshHome, 'integrations', 'dsh-wps', 'state.json');
const credPath = join(dshHome, '.credentials.yaml');

async function loadSecret(ref) {
  const raw = await readFile(credPath, 'utf8');
  const match = raw.match(new RegExp(`^\\s*${ref}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

async function defaultChatId() {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const key = Object.keys(state.sessions ?? {})[0];
    if (!key) return null;
    return key.replace(/^group:/, '').replace(/^direct:/, '');
  } catch {
    return null;
  }
}

const config = JSON.parse(await readFile(configPath, 'utf8'));
const secret = await loadSecret(config.appSecretRef);
if (!secret) throw new Error(`找不到凭据 ${config.appSecretRef}`);

const chatId = process.argv[2] ?? await defaultChatId();
if (!chatId) throw new Error('请传入 chatId 或确保 state.json 里有会话');

console.log('WPS 流式卡片 API 测试');
console.log('  App ID :', config.appId);
console.log('  chatId :', chatId);
console.log('  debug  :', process.env.DSH_WPS_DEBUG ?? '(off, set DSH_WPS_DEBUG=1 for trace)');

const provider = new WpsTokenProvider({ appId: config.appId, appSecret: secret });
await provider.verifyCredentials();
const api = new WpsApiClient({ tokenProvider: provider });

let updateCount = 0;
const session = createWpsStreamingSession({
  initialText: DEFAULT_INITIAL_TEXT,
  sendCard: async (payload) => {
    console.log('[test] create card…');
    const result = await api.createMessage({
      chatId,
      type: payload.type,
      content: payload.content,
    });
    console.log('[test] create ok messageId=', result.messageId);
    return { messageId: result.messageId, message_id: result.messageId };
  },
  updateCard: async (messageId, payload) => {
    updateCount += 1;
    const body = payload?.content?.card?.i18n_items?.[0]?.value?.elements?.[0]?.text?.text?.content ?? '';
    console.log(`[test] update #${updateCount} messageId=${messageId} chars=${body.length} preview=${JSON.stringify(body.slice(0, 40))}`);
    await api.updateMessage({
      messageId,
      type: payload.type,
      content: payload.content,
    });
    console.log(`[test] update #${updateCount} ok`);
  },
  logger: console,
  onUpdateError: (error) => {
    console.error('[test] onUpdateError — stream broken:', error?.message ?? error);
  },
});

const { controller } = await session.begin();
const chunks = ['流式测试第一段…', '流式测试第二段，内容变长了。', '流式测试完成：请在 WPS 群里看卡片是否逐步更新。'];
for (const chunk of chunks) {
  await controller.setContent(chunk);
  await new Promise((r) => setTimeout(r, 800));
}
await controller.finish(chunks.at(-1));
console.log(`\n完成。共 ${updateCount} 次中间 update + 1 次 finish。请在 WPS 会话里查看消息。`);
