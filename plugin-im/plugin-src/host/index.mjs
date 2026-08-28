import { installOutboundArtifactTool } from '../../src/channels/shared/semantic/artifact.mjs';
import { setImHostLanguage } from '../../src/channels/shared/i18n.mjs';
import { apply as applyWps } from './channels/wps/index.mjs';

export const name = 'dsh-wps-host';
export const inject = ['connection', 'credentials', 'apiProxy', 'typertGateway'];

export async function apply(ctx, config = {}) {
  const resolved = config ?? {};
  setImHostLanguage(resolved.language ?? process.env.DSH_WPS_LANGUAGE ?? process.env.DSH_IM_LANGUAGE);
  if (typeof ctx?.inject === 'function') {
    ctx.inject(['tools', 'systemPrompt'], (artifactCtx) => {
      installOutboundArtifactTool(artifactCtx);
    });
  } else {
    installOutboundArtifactTool(ctx);
  }
  return applyWps(ctx, resolved);
}

export { createWpsHostPlugin } from './channels/wps/index.mjs';
