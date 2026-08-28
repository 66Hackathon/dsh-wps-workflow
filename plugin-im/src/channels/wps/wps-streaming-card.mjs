/**
 * WPS 协作卡片流式呈现草稿。
 *
 * 与飞书 VerifiedFeishuChannel.stream() 的对照：
 * - 飞书：cardkit 创建卡片 + cardElement.content 增量更新 element_id
 * - WPS：single-create-msg 发 card + update-msg 全量刷新整张卡片（仅支持 type=card）
 *
 * WPS 没有 streaming_mode / print_frequency_ms 一类平台级打字机 API；
 * 流式效果靠客户端节流后反复调用更新消息接口实现。
 *
 * 文档：
 * - 卡片结构 https://open.wps.cn/documents/app-integration-dev/guide/card/card-structure
 * - 更新消息 https://open.wps.cn/documents/app-integration-dev/wps365/server/im/message/update-msg
 */

import { wpsLogError, wpsTrace } from './wps-trace.mjs';

export const WPS_CARD_MAX_CHARS = 15_000;
export const DEFAULT_STREAM_THROTTLE_MS = 250;
export const DEFAULT_INITIAL_TEXT = '已连接 DeepSeek Harness，正在思考…';

function plainText(content) {
  return {
    tag: 'text',
    text: {
      type: 'plain',
      content: String(content ?? ''),
    },
  };
}

function markdownElement(content) {
  return {
    text: {
      tag: 'text',
      text: {
        type: 'markdown',
        content: String(content ?? ''),
      },
    },
  };
}

function summaryOf(text) {
  const summary = String(text ?? '').replace(/\s+/g, ' ').trim();
  return summary.length <= 50 ? summary : `${summary.slice(0, 49)}…`;
}

/**
 * 构造 WPS 卡片 JSON（用于 create / update 的 content.card）。
 *
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {string} options.body Markdown 正文
 * @param {boolean} [options.streaming=true] 流式中：processing_state=unprocessed
 */
export function buildWpsStreamingCard({
  title = 'DeepSeek Harness',
  subtitle,
  body,
  streaming = true,
}) {
  const header = {
    title: plainText(title),
  };
  if (subtitle) {
    header.subtitle = plainText(subtitle);
  }

  return {
    config: {
      // 必须为共享卡片：WPS update-msg 对独享卡片返回 msg not updatable
      shared_card: true,
      allowd_operate_list: ['accept_all'],
      processing_state: streaming ? 'unprocessed' : 'processed',
    },
    i18n_items: [{
      key: 'zh-CN',
      value: {
        header,
        elements: [markdownElement(body)],
      },
    }],
  };
}

/**
 * 包一层发送/更新消息 API 所需的 type + content。
 */
export function wpsCardMessagePayload(card) {
  return {
    type: 'card',
    content: { card },
  };
}

function assertMarkdownLength(content) {
  if (String(content ?? '').length > WPS_CARD_MAX_CHARS) {
    throw new Error(`WPS card markdown exceeds ${WPS_CARD_MAX_CHARS} characters`);
  }
}

/**
 * 流式会话：先发占位卡片，再节流全量 update，最后收成终态。
 *
 * @example
 * const session = createWpsStreamingSession({
 *   initialText: DEFAULT_INITIAL_TEXT,
 *   sendCard: (payload) => wpsApi.createMessage(chatId, payload),
 *   updateCard: (messageId, payload) => wpsApi.updateMessage(messageId, payload),
 * });
 * const { messageId, controller } = await session.begin();
 * await harnessStream({
 *   markdown: async ({ setContent }) => {
 *     await controller.setContent('第一段…');
 *     await controller.setContent('完整回答…');
 *   },
 * });
 * await controller.finish();
 */
export function createWpsStreamingSession({
  initialText = DEFAULT_INITIAL_TEXT,
  title,
  sendCard,
  updateCard,
  throttleMs = DEFAULT_STREAM_THROTTLE_MS,
  logger = null,
  onUpdateError = null,
  now = Date.now,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
}) {
  if (typeof sendCard !== 'function' || typeof updateCard !== 'function') {
    throw new TypeError('WPS streaming session requires sendCard and updateCard');
  }

  let messageId = null;
  let lastContent = initialText;
  let lastSentAt = 0;
  let pendingContent = null;
  let flushTimer = null;
  let sequence = 0;

  const reportUpdateError = (error) => {
    wpsLogError('streaming card update failed:', error);
    logger?.warn?.('[dsh-wps] streaming card update failed:', error);
    if (typeof onUpdateError === 'function') {
      try {
        onUpdateError(error);
      } catch {
        // ignore observer failures
      }
    }
  };

  const flush = async () => {
    flushTimer = null;
    const next = pendingContent;
    if (next === null || next === lastContent || !messageId) return;
    assertMarkdownLength(next);
    const card = buildWpsStreamingCard({
      title,
      subtitle: '正在生成…',
      body: next,
      streaming: true,
    });
    await updateCard(messageId, wpsCardMessagePayload(card));
    lastContent = next;
    lastSentAt = now();
    sequence += 1;
    pendingContent = null;
    wpsTrace('card update', { messageId, sequence, chars: next.length });
  };

  const flushOrReport = async () => {
    try {
      await flush();
    } catch (error) {
      reportUpdateError(error);
      throw error;
    }
  };

  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    const elapsed = now() - lastSentAt;
    const delay = Math.max(0, throttleMs - elapsed);
    flushTimer = setTimeoutFn(() => {
      void flushOrReport().catch(() => {
        // reported via reportUpdateError / onUpdateError
      });
    }, delay);
    flushTimer?.unref?.();
  };

  const controller = {
    get messageId() {
      return messageId;
    },
    async setContent(content) {
      const next = String(content ?? '') || '…';
      if (next === lastContent && pendingContent === null) return;
      pendingContent = next;
      await flushOrReport();
    },
    async setContentThrottled(content) {
      const next = String(content ?? '') || '…';
      if (next === lastContent && pendingContent === null) return;
      pendingContent = next;
      if (flushTimer !== null) return;
      const elapsed = now() - lastSentAt;
      const delay = Math.max(0, throttleMs - elapsed);
      if (delay === 0) {
        try {
          await flushOrReport();
        } catch {
          // reported via reportUpdateError / onUpdateError
        }
        return;
      }
      scheduleFlush();
    },
    async finish(finalContent = lastContent) {
      if (flushTimer !== null) {
        clearTimeoutFn(flushTimer);
        flushTimer = null;
      }
      const body = String(finalContent ?? pendingContent ?? lastContent ?? '') || '…';
      assertMarkdownLength(body);
      if (messageId && pendingContent !== null && pendingContent !== lastContent) {
        await flushOrReport();
      }
      if (messageId && body !== lastContent) {
        pendingContent = body;
        await flushOrReport();
      }
      const card = buildWpsStreamingCard({
        title,
        subtitle: summaryOf(body) || '回答完成',
        body,
        streaming: false,
      });
      if (!messageId) {
        const created = await sendCard(wpsCardMessagePayload(card));
        messageId = created?.message_id ?? created?.messageId ?? null;
        lastContent = body;
        return { messageId, sequence };
      }
      await updateCard(messageId, wpsCardMessagePayload(card));
      lastContent = body;
      pendingContent = null;
      sequence += 1;
      wpsTrace('stream finish', { messageId, sequence, chars: body.length });
      return { messageId, sequence };
    },
    cancel() {
      if (flushTimer !== null) {
        clearTimeoutFn(flushTimer);
        flushTimer = null;
      }
      pendingContent = null;
    },
  };

  return {
    async begin() {
      const card = buildWpsStreamingCard({
        title,
        subtitle: '正在生成…',
        body: initialText,
        streaming: true,
      });
      const created = await sendCard(wpsCardMessagePayload(card));
      messageId = created?.message_id ?? created?.messageId ?? null;
      if (!messageId) {
        throw new Error('WPS create card message returned no message_id');
      }
      lastSentAt = now();
      wpsTrace('stream begin', { messageId });
      return { messageId, controller };
    },
    controller,
  };
}
