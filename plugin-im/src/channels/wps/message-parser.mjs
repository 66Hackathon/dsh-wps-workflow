export const WPS_CHAT_TYPE_GROUP = 'group';
export const WPS_CHAT_TYPE_P2P = 'p2p';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Remove WPS @ markup from text, e.g. `<at id="1">BOT</at> 你好` → `你好`. */
export function stripWpsAtMarkup(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(/<at\b[^>]*>[\s\S]*?<\/at>/gi, '')
    .replace(/^\|+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRichTextContent(content) {
  const blocks = content?.rich_text?.elements
    ?? content?.elements
    ?? (Array.isArray(content) ? content : null);
  if (!Array.isArray(blocks)) return null;
  const parts = [];
  for (const block of blocks) {
    const text = nonEmptyString(block?.text?.content)
      ?? nonEmptyString(block?.text)
      ?? nonEmptyString(block?.content);
    if (text) parts.push(stripWpsAtMarkup(text));
  }
  return parts.length ? parts.join(' ') : null;
}

function extractTextContent(content, messageType) {
  if (!content || typeof content !== 'object') return null;
  if (messageType === 'rich_text') {
    return extractRichTextContent(content);
  }
  const direct = nonEmptyString(content.text?.content);
  if (direct) return stripWpsAtMarkup(direct);
  const nested = nonEmptyString(content.content?.text?.content);
  if (nested) return stripWpsAtMarkup(nested);
  const fallback = nonEmptyString(content.content);
  if (fallback) return stripWpsAtMarkup(fallback);
  return extractRichTextContent(content);
}

function mentionsApp(message) {
  const mentions = message?.mentions;
  if (!Array.isArray(mentions) || mentions.length === 0) return false;
  return mentions.some((item) => item?.identity?.type === 'app' || item?.type === 'app');
}

export function isGroupChatType(chatType) {
  return chatType === WPS_CHAT_TYPE_GROUP;
}

export function isP2pChatType(chatType) {
  if (!chatType) return false;
  return chatType === WPS_CHAT_TYPE_P2P
    || chatType === 'single'
    || chatType === 'direct'
    || chatType === 'private';
}

/**
 * Normalize decrypted `kso.app_chat.message` payload.
 * Event code: `kso.app_chat.message.create` (group @ and p2p direct chat share this).
 */
export function parseWpsChatMessageEvent(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!data || typeof data !== 'object') return null;

  const chatId = nonEmptyString(data.chat?.id);
  const chatType = nonEmptyString(data.chat?.type);
  const messageId = nonEmptyString(data.message?.id);
  const senderId = nonEmptyString(data.sender?.id);
  const senderType = nonEmptyString(data.sender?.type) ?? 'user';
  const messageType = nonEmptyString(data.message?.type) ?? 'text';
  const companyId = nonEmptyString(data.company_id);

  if (!chatId || !messageId || !senderId) return null;

  const text = (messageType === 'text' || messageType === 'rich_text')
    ? extractTextContent(data.message?.content, messageType)
    : null;

  return Object.freeze({
    chatId,
    chatType,
    companyId,
    messageId,
    messageType,
    senderId,
    senderType,
    text,
    isAtBot: mentionsApp(data.message),
    raw: data,
  });
}

/** Group chats need @; p2p / unknown chat types accept plain text. */
export function shouldHandleIncomingMessage(parsed, { appId } = {}) {
  if (!parsed) return false;
  if (parsed.senderType === 'app') return false;
  if (!parsed.text) return false;
  if (isGroupChatType(parsed.chatType)) {
    if (parsed.isAtBot) return true;
    if (appId && Array.isArray(parsed.raw?.message?.mentions)) {
      return parsed.raw.message.mentions.some((item) => item?.identity?.id === appId);
    }
    return false;
  }
  return true;
}

/** @deprecated Use shouldHandleIncomingMessage */
export const shouldHandleGroupMessage = shouldHandleIncomingMessage;
