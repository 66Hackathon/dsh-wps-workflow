import {
  WPS_MODES,
  WPS_RPC_CHANNEL,
  WPS_RPC_ENDPOINTS,
  WPS_TRANSPORTS,
} from '../../../../src/channels/wps/protocol.mjs';

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function unwrapWpsRpc(result) {
  if (!record(result) || typeof result.ok !== 'boolean') {
    throw new Error('WPS 服务返回了无法识别的响应');
  }
  if (!result.ok) {
    const error = new Error(typeof result.error?.message === 'string' ? result.error.message : 'WPS 操作失败');
    error.code = typeof result.error?.code === 'string' ? result.error.code : 'wps-rpc-error';
    throw error;
  }
  return result.value;
}

export function normalizeWpsStatus(value) {
  if (!record(value) || value.configured !== true) {
    return {
      configured: false,
      connected: false,
      state: 'unconfigured',
      mode: WPS_MODES.HARNESS,
      config: null,
      transport: null,
      callbackUrl: null,
      health: null,
    };
  }
  return {
    configured: true,
    connected: value.connected === true,
    state: typeof value.state === 'string' ? value.state : 'idle',
    mode: value.mode ?? WPS_MODES.ECHO,
    config: record(value.config) ? value.config : null,
    transport: value.transport ?? null,
    callbackUrl: typeof value.callbackUrl === 'string' ? value.callbackUrl : null,
    health: record(value.health) ? value.health : null,
  };
}

export {
  WPS_MODES,
  WPS_RPC_CHANNEL,
  WPS_RPC_ENDPOINTS,
  WPS_TRANSPORTS,
};
