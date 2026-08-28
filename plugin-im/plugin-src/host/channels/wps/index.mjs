import { createProductionController } from './production.mjs';
import { installWpsRpc } from './rpc.mjs';

export const name = 'dsh-wps-host';
export const inject = ['connection', 'credentials'];

export async function apply(ctx, config = {}) {
  const resolved = config ?? {};
  if (resolved.controller) {
    return installWpsRpc(ctx, resolved.controller, resolved.rpcAuthority);
  }
  const production = await createProductionController(ctx, resolved, resolved.internals ?? {});
  const disposeRpc = installWpsRpc(ctx, production.controller, resolved.rpcAuthority);
  ctx.effect(() => async () => {
    await production.close();
  }, 'dsh-wps: close transport');
  return disposeRpc;
}

export function createWpsHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.mjs';
export { createWpsRpcHandler, installWpsRpc, WPS_RPC_CHANNEL, WPS_RPC_ENDPOINTS } from './rpc.mjs';
