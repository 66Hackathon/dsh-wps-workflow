import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

export const WPS_EVENT_TOPIC_CHAT_MESSAGE = 'kso.app_chat.message';
export const WPS_EVENT_OPERATION_CREATE = 'create';

function md5Hex(secret) {
  return createHash('md5').update(secret).digest('hex');
}

function ivFromNonce(nonce) {
  const bytes = Buffer.from(String(nonce ?? ''), 'utf8');
  if (bytes.length >= 16) return bytes.subarray(0, 16);
  return Buffer.concat([bytes, Buffer.alloc(16 - bytes.length)]);
}

export function signEventContent(content, secretKey) {
  return createHmac('sha256', secretKey)
    .update(content)
    .digest('base64url');
}

export function buildEventSignatureContent({
  accessKey,
  topic,
  nonce,
  time,
  encryptedData,
}) {
  return `${accessKey}:${topic}:${nonce}:${time}:${encryptedData}`;
}

export function verifyEventSignature(event, { appId, appSecret }) {
  if (!event || typeof event !== 'object') return false;
  const {
    topic,
    nonce,
    time,
    signature,
    encrypted_data: encryptedData,
  } = event;
  if (!topic || !nonce || time === undefined || !signature || !encryptedData) return false;
  const content = buildEventSignatureContent({
    accessKey: appId,
    topic,
    nonce,
    time,
    encryptedData,
  });
  const expected = signEventContent(content, appSecret);
  const actual = String(signature).replace(/=+$/, '');
  const expectedNormalized = expected.replace(/=+$/, '');
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedNormalized);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function decryptEventData(encryptedData, { appSecret, nonce }) {
  const key = Buffer.from(md5Hex(appSecret), 'utf8');
  const iv = ivFromNonce(nonce);
  const ciphertext = Buffer.from(String(encryptedData), 'base64');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  // Node removes PKCS7 padding automatically; WPS events use standard PKCS7.
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (!plain.length) throw new Error('WPS event plaintext is empty');
  return plain.toString('utf8');
}

export function encryptEventData(plainText, { appSecret, nonce }) {
  const key = Buffer.from(md5Hex(appSecret), 'utf8');
  const iv = ivFromNonce(nonce);
  const plain = Buffer.from(String(plainText), 'utf8');
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return encrypted.toString('base64');
}

export function parseCallbackBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('WPS callback body must be an object');
  }
  if (body.challenge !== undefined && body.challenge !== null) {
    return { kind: 'challenge', challenge: String(body.challenge) };
  }
  if (body.topic && body.encrypted_data) {
    return { kind: 'event', event: body };
  }
  throw new Error('Unrecognized WPS callback payload');
}

export function challengeResponse(challenge) {
  return { challenge: String(challenge) };
}

export function eventAckResponse() {
  return { code: 0 };
}
