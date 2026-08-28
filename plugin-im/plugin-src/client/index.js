import * as React from 'react';
import manifest from '../../package.json' with { type: 'json' };

import { WPS_RPC_CHANNEL } from './channels/wps/api.js';
import { WpsSettingsTab } from './channels/wps/index.js';
import { installWpsStyles } from './channels/wps/styles.js';
import { en, h, WPS_LOCALE_NAMESPACE, setWpsTranslator, zh } from './i18n.js';
import {
  createLoopbackAwareRpcCall,
  replacePageLocation,
} from './loopback-recovery.js';

export const name = 'wps-settings';
export const inject = ['slots', 'connection', 'locale'];
export const WPS_PLUGIN_VERSION = manifest.version;

function LoopbackRecoveryNotice({ recovery, onNavigate = replacePageLocation }) {
  return h('div', { className: 'wpswf-loopback', role: 'alert' },
    h('div', null,
      h('strong', null, '请改用 localhost 重新打开'),
      h('p', null, '当前地址与浏览器的本机请求校验不兼容。页面会在同端口重新打开，配置不会丢失。'),
      h('code', null, recovery.origin)),
    h('button', {
      type: 'button',
      className: 'wpswf-loopbackBtn',
      onClick: () => onNavigate(recovery.url),
    }, '使用 localhost 重新打开'));
}

export function WpsSettingsPage({
  wpsRpcCall,
  browserLocation = globalThis.location,
  navigateToRecoveryUrl = replacePageLocation,
}) {
  const [loopbackRecovery, setLoopbackRecovery] = React.useState(null);
  const reportLoopbackRecovery = React.useCallback((recovery) => {
    setLoopbackRecovery((current) => current?.url === recovery.url ? current : recovery);
  }, []);
  const rpcCall = React.useMemo(() => createLoopbackAwareRpcCall(wpsRpcCall, {
    location: browserLocation,
    onRecovery: reportLoopbackRecovery,
  }), [browserLocation, reportLoopbackRecovery, wpsRpcCall]);

  return h(React.Fragment, null,
    loopbackRecovery
      ? h(LoopbackRecoveryNotice, {
          recovery: loopbackRecovery,
          onNavigate: navigateToRecoveryUrl,
        })
      : null,
    h(WpsSettingsTab, { rpcCall, version: WPS_PLUGIN_VERSION }));
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(WPS_LOCALE_NAMESPACE, { zh, en }),
    'wps-settings: bilingual dictionaries',
  );
  const t = ctx.locale.bind(WPS_LOCALE_NAMESPACE);
  setWpsTranslator(t);

  ctx.effect(() => installWpsStyles(), 'wps-settings: install styles');

  const wpsRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(WPS_RPC_CHANNEL, endpoint, payload, signal);

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-wps-settings',
    order: 21,
    label: () => t('WPS 协作'),
    locale: WPS_LOCALE_NAMESPACE,
    inject: () => ({ wpsRpcCall }),
  }, WpsSettingsPage));
}
