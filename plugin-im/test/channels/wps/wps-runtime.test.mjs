import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeWpsMessage } from '../../../src/channels/wps/wps-runtime.mjs';

const APP_ID = 'AK2024TESTAPP';

test('normalizeWpsMessage accepts group @ messages and p2p text', () => {
  const group = normalizeWpsMessage({
    chatId: 'chat_group',
    chatType: 'group',
    messageId: 'msg_1',
    senderId: 'user_1',
    senderType: 'user',
    messageType: 'text',
    text: '你好',
    isAtBot: true,
    raw: {},
  }, { appId: APP_ID });
  assert.equal(group?.kind, 'group');
  assert.equal(group?.conversationId, 'chat_group');
  assert.equal(group?.content, '你好');
  assert.equal(group?.addressed, true);

  const p2p = normalizeWpsMessage({
    chatId: 'chat_p2p',
    chatType: 'p2p',
    messageId: 'msg_2',
    senderId: 'user_2',
    senderType: 'user',
    messageType: 'text',
    text: '私聊问题',
    isAtBot: false,
    raw: {},
  }, { appId: APP_ID });
  assert.equal(p2p?.kind, 'direct');
  assert.equal(p2p?.content, '私聊问题');
});

test('normalizeWpsMessage ignores group messages without @', () => {
  const ignored = normalizeWpsMessage({
    chatId: 'chat_group',
    chatType: 'group',
    messageId: 'msg_3',
    senderId: 'user_1',
    senderType: 'user',
    messageType: 'text',
    text: '未 @ 机器人',
    isAtBot: false,
    raw: {},
  }, { appId: APP_ID });
  assert.equal(ignored, null);
});
