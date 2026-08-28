import { resolveRpcAuthority } from '../../rpc-authority.mjs';
import {
  WPS_RPC_CHANNEL,
  WPS_RPC_ENDPOINTS,
} from '../../../../src/channels/wps/protocol.mjs';

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys) {
  return record(value) && Object.keys(value).every((key) => keys.includes(key));
}

function validConfigure(payload) {
  if (!record(payload) || typeof payload.appId !== 'string') return false;
  const keys = Object.keys(payload);
  const allowed = ['appId', 'appSecret', 'transport', 'callbackPort', 'callbackPath', 'mode'];
  if (!keys.every((key) => allowed.includes(key))) return false;
  if (payload.appSecret !== undefined && typeof payload.appSecret !== 'string') return false;
  if (payload.transport !== undefined && typeof payload.transport !== 'string') return false;
  if (payload.callbackPort !== undefined && !Number.isInteger(payload.callbackPort)) return false;
  if (payload.callbackPath !== undefined && typeof payload.callbackPath !== 'string') return false;
  if (payload.mode !== undefined && typeof payload.mode !== 'string') return false;
  return true;
}

export function createWpsRpcHandler(controller) {
  for (const method of ['status', 'configure', 'reconnect', 'test', 'remove']) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`WPS controller requires ${method}()`);
    }
  }
  return async (endpoint, payload, signal) => {
    if (signal?.aborted) {
      return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    }
    try {
      let value;
      if (endpoint === WPS_RPC_ENDPOINTS.status && exact(payload, [])) {
        value = await controller.status();
      } else if (endpoint === WPS_RPC_ENDPOINTS.configure && validConfigure(payload)) {
        value = await controller.configure(payload);
      } else if (endpoint === WPS_RPC_ENDPOINTS.reconnect && exact(payload, [])) {
        value = await controller.reconnect();
      } else if (endpoint === WPS_RPC_ENDPOINTS.test && exact(payload, [])) {
        value = await controller.test();
      } else if (endpoint === WPS_RPC_ENDPOINTS.remove && exact(payload, ['confirm']) && payload.confirm === true) {
        value = await controller.remove();
      } else {
        return { ok: false, error: { code: 'bad-request', message: 'Invalid WPS request.' } };
      }
      return { ok: true, value };
    } catch (error) {
      const code = error?.code === 'invalid-token' ? 'invalid-credentials' : 'wps-operation-failed';
      const message = error instanceof TypeError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'WPS 操作失败，请稍后重试。';
      return { ok: false, error: { code, message } };
    }
  };
}

export function installWpsRpc(ctx, controller, authority) {
  return ctx.connection.rpc.handle(
    WPS_RPC_CHANNEL,
    createWpsRpcHandler(controller),
    { authority: resolveRpcAuthority(authority) },
  );
}

export { WPS_RPC_CHANNEL, WPS_RPC_ENDPOINTS };
