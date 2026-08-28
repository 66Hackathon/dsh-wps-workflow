import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { WpsConfigStore } from '../../../../src/channels/wps/config-store.mjs';
import { WpsHarnessClient } from '../../../../src/channels/wps/harness-client.mjs';
import { wpsBotId } from '../../../../src/channels/wps/protocol.mjs';
import { WpsController } from '../../../../src/channels/wps/wps-controller.mjs';
import { WpsRuntime } from '../../../../src/channels/wps/wps-runtime.mjs';
import { WpsStateStore } from '../../../../src/channels/wps/state-store.mjs';
import { listAgentPresetCatalog } from '../../../../src/channels/shared/agent-preset.mjs';
import { BotWorkspaceStore } from '../../../../src/channels/shared/bot-workspace-store.mjs';
import { createHarnessCommandExecutor } from '../../harness-command-executor.mjs';
import { createHarnessSessionExecutors } from '../../harness-session-coordinator.mjs';
import { harnessConnection } from '../../harness-connection.mjs';

export function wpsPaths(config = {}) {
  const resolved = config ?? {};
  const dshHome = resolve(resolved.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(resolved.dataDir ?? join(dshHome, 'integrations', 'dsh-wps'));
  return {
    root,
    config: resolve(resolved.configPath ?? join(root, 'config.json')),
    state: resolve(resolved.statePath ?? join(root, 'state.json')),
    workspaces: resolve(resolved.workspacesPath ?? join(root, 'workspaces.json')),
  };
}

export async function createProductionController(ctx, config = {}, internals = {}) {
  const resolved = config ?? {};
  const connection = harnessConnection(ctx, resolved);
  const Store = internals.ConfigStore ?? WpsConfigStore;
  const StateStore = internals.StateStore ?? WpsStateStore;
  const Controller = internals.Controller ?? WpsController;
  const Runtime = internals.Runtime ?? WpsRuntime;
  const ResolvedHarness = internals.HarnessClient ?? WpsHarnessClient;
  const paths = wpsPaths(resolved);
  const configStore = await new Store(paths.config).load();
  const stateStore = await new StateStore(paths.state).load();
  const defaultWorkspace = resolve(resolved.workspace ?? process.cwd());
  const WorkspaceStore = internals.WorkspaceStore ?? BotWorkspaceStore;
  const workspaces = internals.workspaces
    ?? await new WorkspaceStore(paths.workspaces, { defaultWorkspace }).load();
  const storedConfig = configStore.get();
  if (storedConfig?.appId) {
    await workspaces.ensure(wpsBotId(storedConfig.appId), {
      defaultAgentPreset: resolved.agentPreset,
    });
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger('dsh-wps') : (ctx.logger ?? console);
  const commandExecutor = createHarnessCommandExecutor(ctx, internals.commandExecutor);
  const {
    controlExecutor,
    sessionMaintenanceExecutor,
    fileIngressExecutor,
  } = createHarnessSessionExecutors(ctx, {
    controlExecutor: internals.controlExecutor,
    sessionMaintenanceExecutor: internals.sessionMaintenanceExecutor,
    fileIngressExecutor: internals.fileIngressExecutor,
  });
  const harness = new ResolvedHarness({
    ...connection,
    workspace: defaultWorkspace,
    autostart: false,
    dshBin: resolved.dshBin ?? 'dsh',
    ...(commandExecutor ? { commandExecutor } : {}),
    ...(controlExecutor ? { controlExecutor } : {}),
    ...(sessionMaintenanceExecutor ? { sessionMaintenanceExecutor } : {}),
    ...(fileIngressExecutor ? { fileIngressExecutor } : {}),
  });
  const agentPresetCatalog = () => listAgentPresetCatalog(ctx);
  const controller = new Controller({
    credentials: ctx.credentials,
    configStore,
    stateStore,
    harness,
    workspaces,
    agentPresetCatalog,
    defaultAgentPreset: resolved.agentPreset,
    logger,
    internals: internals.transport ?? {},
    createRuntime: (options) => new Runtime(options),
  });
  await controller.initialize();
  return { controller, close: () => controller.close(), paths, workspaces };
}
