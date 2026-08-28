import { TextHarnessBridge, createTextBridgeStatus } from '../shared/text-harness-bridge.mjs';

export const WPS_DESCRIPTOR = Object.freeze({
  key: 'wps',
  label: 'WPS 协作',
  connectionLabel: ' 事件通道',
});

export class WpsHarnessBridge extends TextHarnessBridge {
  constructor(options) {
    super({ descriptor: WPS_DESCRIPTOR, ...options });
  }
}

export { createTextBridgeStatus as createWpsBridgeStatus };
