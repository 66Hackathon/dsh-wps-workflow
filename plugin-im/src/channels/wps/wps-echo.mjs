import {
  isWpsChatMessageCreate,
} from './wps-event-ws.mjs';
import {
  parseWpsChatMessageEvent,
  shouldHandleIncomingMessage,
} from './message-parser.mjs';

/**
 * Echo handler for step-4 verification: reply with the same text body.
 */
export function createWpsEchoHandler({
  api,
  appId,
  logger = console,
  shouldHandle = shouldHandleIncomingMessage,
}) {
  if (!api?.createTextMessage) throw new TypeError('WPS echo handler requires api.createTextMessage');

  return async function handleWpsEvent(event) {
    if (!isWpsChatMessageCreate(event)) return;
    const parsed = parseWpsChatMessageEvent(event.plain);
    if (!parsed?.text) {
      logger.debug?.('[dsh-wps] skip message without text', {
        chatType: parsed?.chatType,
        messageType: parsed?.messageType,
      });
      return;
    }
    if (!shouldHandle(parsed, { appId })) {
      logger.debug?.('[dsh-wps] skip message by filter', {
        chatType: parsed.chatType,
        isAtBot: parsed.isAtBot,
      });
      return;
    }
    const reply = await api.createTextMessage({
      chatId: parsed.chatId,
      text: parsed.text,
      markdown: false,
    });
    logger.info?.('[dsh-wps] echo reply sent', {
      chatId: parsed.chatId,
      messageId: reply.messageId,
    });
    return reply;
  };
}
