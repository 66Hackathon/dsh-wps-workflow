import { HarnessClient } from '../shared/harness-client.mjs';

export class WpsHarnessClient extends HarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'wps',
      logPrefix: 'dsh-wps',
    });
  }
}
