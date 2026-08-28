import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseWpsChatMessageEvent,
  shouldHandleGroupMessage,
  shouldHandleIncomingMessage,
  stripWpsAtMarkup,
} from '../../../src/channels/wps/message-parser.mjs';

const SAMPLE = {
  chat: { id: 'chat_1', type: 'group' },
  company_id: 'co_1',
  message: {
    id: 'msg_1',
    type: 'text',
    content: { text: { content: '你好' } },
    mentions: [{ identity: { id: 'app_1', type: 'app' } }],
  },
  sender: { id: 'user_1', type: 'user' },
};

test('parseWpsChatMessageEvent extracts text chat metadata', () => {
  const parsed = parseWpsChatMessageEvent(SAMPLE);
  assert.equal(parsed.chatId, 'chat_1');
  assert.equal(parsed.text, '你好');
  assert.equal(parsed.isAtBot, true);
});

test('shouldHandleGroupMessage requires @ for group chats', () => {
  const parsed = parseWpsChatMessageEvent(SAMPLE);
  assert.equal(shouldHandleGroupMessage(parsed, { appId: 'app_1' }), true);
  const noMention = parseWpsChatMessageEvent({
    ...SAMPLE,
    message: {
      ...SAMPLE.message,
      mentions: [],
    },
  });
  assert.equal(shouldHandleGroupMessage(noMention), false);
});

test('stripWpsAtMarkup removes inline @ tags from message text', () => {
  const parsed = parseWpsChatMessageEvent({
    ...SAMPLE,
    message: {
      ...SAMPLE.message,
      content: {
        text: { content: '|<at id="1">GIT-ROBOT</at> 你好啊' },
      },
    },
  });
  assert.equal(parsed.text, '你好啊');
  assert.equal(stripWpsAtMarkup('<at id="1">BOT</at> 测试123'), '测试123');
});

test('shouldHandleIncomingMessage accepts p2p without @mention', () => {
  const parsed = parseWpsChatMessageEvent({
    chat: { id: 'chat_p2p', type: 'p2p' },
    company_id: 'co_1',
    message: {
      id: 'msg_p2p',
      type: 'text',
      content: { text: { content: '你好啊' } },
    },
    sender: { id: 'user_1', type: 'user' },
  });
  assert.equal(shouldHandleIncomingMessage(parsed), true);
});

test('shouldHandleIncomingMessage accepts chat without type as direct message', () => {
  const parsed = parseWpsChatMessageEvent({
    chat: { id: 'chat_direct' },
    company_id: 'co_1',
    message: {
      id: 'msg_direct',
      type: 'text',
      content: { text: { content: '私聊测试' } },
    },
    sender: { id: 'user_1', type: 'user' },
  });
  assert.equal(parsed.chatType, null);
  assert.equal(shouldHandleIncomingMessage(parsed), true);
});

test('parseWpsChatMessageEvent extracts rich_text content', () => {
  const parsed = parseWpsChatMessageEvent({
    chat: { id: 'chat_p2p', type: 'p2p' },
    message: {
      id: 'msg_rt',
      type: 'rich_text',
      content: {
        elements: [{ text: { content: '富文本你好' } }],
      },
    },
    sender: { id: 'user_1', type: 'user' },
  });
  assert.equal(parsed.text, '富文本你好');
});
