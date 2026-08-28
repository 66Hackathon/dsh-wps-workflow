export const WPS_RPC_CHANNEL = '/wps';
export const WPS_SECRET_REF = 'DSH_WPS_APP_SECRET';

export const WPS_RPC_ENDPOINTS = Object.freeze({
  status: 'status',
  configure: 'configure',
  reconnect: 'reconnect',
  test: 'test',
  remove: 'remove',
});

export const WPS_TRANSPORTS = Object.freeze({
  WEBSOCKET: 'websocket',
  HTTP: 'http',
});

export const WPS_MODES = Object.freeze({
  ECHO: 'echo',
  HARNESS: 'harness',
});

/** Stable bot id for BotWorkspaceStore (WPS App ID matches the allowed pattern). */
export function wpsBotId(appId) {
  const id = typeof appId === 'string' ? appId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new TypeError('WPS App ID cannot be used as a workspace bot id');
  }
  return id;
}
