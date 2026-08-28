import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWpsStreamingCard,
  createWpsStreamingSession,
  wpsCardMessagePayload,
} from '../../../src/channels/wps/wps-streaming-card.mjs';

test('buildWpsStreamingCard uses markdown body and unprocessed state while streaming', () => {
  const card = buildWpsStreamingCard({
    title: 'Harness',
    subtitle: '正在生成…',
    body: '你好',
    streaming: true,
  });

  assert.equal(card.config.shared_card, true);
  assert.equal(card.config.processing_state, 'unprocessed');
  assert.equal(card.i18n_items[0].key, 'zh-CN');
  assert.equal(card.i18n_items[0].value.header.title.text.content, 'Harness');
  assert.equal(card.i18n_items[0].value.elements[0].text.text.type, 'markdown');
  assert.equal(card.i18n_items[0].value.elements[0].text.text.content, '你好');
});

test('wpsCardMessagePayload wraps card for create/update APIs', () => {
  const payload = wpsCardMessagePayload(buildWpsStreamingCard({ body: 'x' }));
  assert.equal(payload.type, 'card');
  assert.equal(payload.content.card.i18n_items[0].value.elements[0].text.text.content, 'x');
});

test('createWpsStreamingSession sends placeholder then updates to final card', async () => {
  const updates = [];
  const session = createWpsStreamingSession({
    initialText: '…',
    sendCard: async () => ({ message_id: 'msg_1' }),
    updateCard: async (messageId, payload) => {
      updates.push({ messageId, state: payload.content.card.config.processing_state });
    },
    now: () => 0,
  });

  const { controller } = await session.begin();
  await controller.setContent('第一段');
  await controller.setContent('最终回答');
  const result = await controller.finish('最终回答');

  assert.equal(result.messageId, 'msg_1');
  assert.equal(updates.length, 3);
  assert.equal(updates[0].state, 'unprocessed');
  assert.equal(updates[1].state, 'unprocessed');
  assert.equal(updates[2].state, 'processed');
});

test('createWpsStreamingSession finish flushes pending throttled content', async () => {
  const updates = [];
  const session = createWpsStreamingSession({
    initialText: '…',
    sendCard: async () => ({ message_id: 'msg_1' }),
    updateCard: async (messageId, payload) => {
      updates.push({
        messageId,
        body: payload.content.card.i18n_items[0].value.elements[0].text.text.content,
        state: payload.content.card.config.processing_state,
      });
    },
    throttleMs: 5000,
    now: () => 0,
  });

  const { controller } = await session.begin();
  await controller.setContentThrottled('中间段');
  const result = await controller.finish('最终回答');

  assert.equal(result.messageId, 'msg_1');
  assert.equal(updates.length, 3);
  assert.equal(updates[0].body, '中间段');
  assert.equal(updates[0].state, 'unprocessed');
  assert.equal(updates[1].body, '最终回答');
  assert.equal(updates[1].state, 'unprocessed');
  assert.equal(updates[2].body, '最终回答');
  assert.equal(updates[2].state, 'processed');
});

test('createWpsStreamingSession reports throttled flush failures', async () => {
  const warnings = [];
  let broken = false;
  const session = createWpsStreamingSession({
    initialText: '…',
    sendCard: async () => ({ message_id: 'msg_1' }),
    updateCard: async () => {
      throw new Error('rate limited');
    },
    throttleMs: 0,
    logger: { warn: (...args) => warnings.push(args) },
    onUpdateError: () => { broken = true; },
    now: () => 0,
    setTimeoutFn: (fn) => {
      fn();
      return 1;
    },
    clearTimeoutFn: () => {},
  });

  const { controller } = await session.begin();
  await controller.setContentThrottled('会失败');
  assert.equal(broken, true);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /streaming card update failed/);
});
