import { createHash, createHmac } from 'node:crypto';

const KSO_PREFIX = 'KSO-1';

export function sha256Hex(body = '') {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * Build KSO-1 headers for WPS OpenAPI requests.
 * @see https://open.wps.cn/documents/app-integration-dev/wps365/server/api-description/signature-description
 */
export function signKso1Request({
  appId,
  appSecret,
  method,
  requestUri,
  contentType = '',
  ksoDate,
  body = '',
}) {
  if (!appId || !appSecret) throw new TypeError('KSO-1 signing requires appId and appSecret');
  const normalizedMethod = String(method ?? '').toUpperCase();
  const normalizedUri = String(requestUri ?? '');
  const normalizedType = contentType ?? '';
  const normalizedBody = body ?? '';
  const bodyHash = normalizedBody ? sha256Hex(normalizedBody) : '';
  const stringToSign = `${KSO_PREFIX}${normalizedMethod}${normalizedUri}${normalizedType}${ksoDate}${bodyHash}`;
  const signature = createHmac('sha256', appSecret).update(stringToSign).digest('hex');
  return {
    'X-Kso-Date': ksoDate,
    'X-Kso-Authorization': `${KSO_PREFIX} ${appId}:${signature}`,
  };
}

export function rfc1123Date(date = new Date()) {
  return date.toUTCString();
}
