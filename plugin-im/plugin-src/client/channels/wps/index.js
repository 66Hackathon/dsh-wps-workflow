import * as React from 'react';

import { WpsLogoGlyph } from '../../channel-logos.js';
import { h } from '../../i18n.js';
import {
  WPS_MODES,
  WPS_RPC_ENDPOINTS,
  WPS_TRANSPORTS,
  normalizeWpsStatus,
  unwrapWpsRpc,
} from './api.js';

function Button({ children, kind = 'secondary', ...props }) {
  const mapped = kind === 'primary' ? 'primary' : kind === 'danger' ? 'danger' : kind === 'quiet' ? 'ghost' : 'secondary';
  return h('button', { ...props, type: 'button', className: 'wpswf-btn', 'data-kind': mapped }, children);
}

function Alert({ kind, title, children }) {
  const icon = kind === 'error'
    ? '!'
    : kind === 'success'
      ? '✓'
      : 'i';
  return h('div', { className: 'wpswf-alert', 'data-kind': kind, role: kind === 'error' ? 'alert' : 'status' },
    h('span', { className: 'wpswf-alertIcon', 'aria-hidden': 'true' }, icon),
    h('div', null, title ? h('strong', null, title) : null, h('p', null, children)));
}

function statusMeta(model) {
  if (model.connected) {
    return {
      tone: 'success',
      label: model.mode === WPS_MODES.ECHO ? 'Echo 已连接' : 'Harness 已连接',
    };
  }
  if (!model.configured) return { tone: 'idle', label: '尚未配置' };
  if (model.state === 'disconnected') return { tone: 'idle', label: '连接未就绪' };
  return { tone: 'idle', label: '已配置，待连接' };
}

function TransportPicker({ value, onChange }) {
  const options = [
    {
      id: WPS_TRANSPORTS.WEBSOCKET,
      title: 'WebSocket',
      desc: '推荐。本地开发免 tunnel，事件实时推送。',
    },
    {
      id: WPS_TRANSPORTS.HTTP,
      title: 'HTTP 回调',
      desc: '需公网 tunnel，将本机端口暴露给 WPS 后台。',
    },
  ];
  return h('div', { className: 'wpswf-transportRow', role: 'radiogroup', 'aria-label': '事件通道' },
    options.map((option) => h('button', {
      key: option.id,
      type: 'button',
      className: 'wpswf-transportCard',
      'data-active': String(value === option.id),
      'aria-pressed': value === option.id,
      onClick: () => onChange(option.id),
    },
    h('strong', null, option.title),
    h('span', null, option.desc))));
}

function GuidePanel() {
  const steps = [
    { title: '创建企业应用', body: '在 365 开放平台获取 App ID 与 App Secret，并开通 IM 发消息权限。' },
    { title: '保存并启动', body: '填写凭据后点击「保存并启动」，等待状态变为已连接。' },
    { title: '群里 @ 机器人', body: '在 WPS 协作群聊 @ 机器人提问，或私聊直接发送；可用 /help 查看命令。' },
  ];
  return h('div', { className: 'wpswf-panel' },
    h('div', { className: 'wpswf-panelBody' },
      h('div', { className: 'wpswf-panelTitle' },
        h('h3', null, '快速上手'),
        h('span', null, '3 步完成接入')),
      h('ol', { className: 'wpswf-guideList' },
        steps.map((step, index) => h('li', { key: step.title, className: 'wpswf-guideItem' },
          h('span', { className: 'wpswf-step' }, String(index + 1)),
          h('div', null,
            h('strong', null, step.title),
            h('p', null, step.body)))))));
}

function HealthPanel({ model }) {
  const rows = [
    ['运行模式', model.mode === WPS_MODES.ECHO ? 'Echo' : 'Harness'],
    ['事件通道', model.transport === WPS_TRANSPORTS.HTTP ? 'HTTP 回调' : 'WebSocket'],
    ['应用标识', model.config?.appIdMasked ?? '—'],
    ['连接状态', model.connected ? '已连接' : (model.configured ? '未连接' : '未配置')],
  ];
  return h('div', { className: 'wpswf-panel' },
    h('div', { className: 'wpswf-panelBody' },
      h('div', { className: 'wpswf-panelTitle' },
        h('h3', null, '运行概览'),
        h('span', null, '本机插件状态')),
      h('dl', { className: 'wpswf-kv' },
        rows.map(([label, value]) => h('div', { key: label, className: 'wpswf-kvRow' },
          h('dt', null, label),
          h('dd', null, value))))));
}

export function WpsSettingsTab({ rpcCall, version }) {
  const [model, setModel] = React.useState(normalizeWpsStatus());
  const [phase, setPhase] = React.useState('loading');
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [form, setForm] = React.useState({
    appId: '',
    appSecret: '',
    transport: WPS_TRANSPORTS.WEBSOCKET,
    callbackPort: '18765',
  });

  const invoke = React.useCallback(async (endpoint, payload = {}) => {
    if (typeof rpcCall !== 'function') throw new Error('WPS 设置页缺少 RPC 连接');
    return unwrapWpsRpc(await rpcCall(endpoint, payload));
  }, [rpcCall]);

  const adopt = React.useCallback((value) => {
    const next = normalizeWpsStatus(value);
    setModel(next);
    if (next.config?.appIdMasked) {
      setForm((current) => ({
        ...current,
        appId: current.appId || '',
        transport: next.transport ?? WPS_TRANSPORTS.WEBSOCKET,
        callbackPort: String(next.config.callbackPort ?? 18_765),
        appSecret: '',
      }));
    }
    return next;
  }, []);

  const load = React.useCallback(async () => {
    try {
      adopt(await invoke(WPS_RPC_ENDPOINTS.status));
      setPhase('ready');
      setError('');
    } catch (caught) {
      setPhase('error');
      setError(caught.message);
    }
  }, [adopt, invoke]);

  React.useEffect(() => { void load(); }, [load]);

  const run = async (name, operation) => {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      const value = await operation();
      adopt(value);
      if (name === 'save') setNotice('机器人已启动。请在群聊 @ 机器人或私聊发送问题。');
      if (name === 'test') setNotice('凭据验证通过，可以开始连接事件通道。');
      if (name === 'reconnect') setNotice('已重新连接事件通道。');
      if (name === 'remove') setNotice('WPS 配置已移除。');
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy('');
    }
  };

  const status = statusMeta(model);

  if (phase === 'loading') {
    return h('div', { className: 'wpswf-page', 'aria-busy': 'true' },
      h('div', { className: 'wpswf-panel' },
        h('div', { className: 'wpswf-loading' },
          h('span', { className: 'wpswf-spinner' }),
          '正在读取 WPS 配置…')));
  }

  return h('section', { className: 'wpswf-page', 'aria-label': 'WPS 协作设置' },
    h('header', { className: 'wpswf-hero' },
      h('div', { className: 'wpswf-heroMain' },
        h('span', { className: 'wpswf-logo', 'aria-hidden': 'true' }, h(WpsLogoGlyph)),
        h('div', null,
          h('p', { className: 'wpswf-eyebrow' }, 'WPS Workflow'),
          h('h2', null, 'WPS 协作机器人'),
          h('p', null, '把 WPS 群聊与私聊接到本机 DeepSeek Harness，支持流式卡片回复与完整会话命令。'))),
      h('span', { className: 'wpswf-status', 'data-tone': status.tone },
        h('span', { className: 'wpswf-statusDot' }),
        status.label,
        version ? ` · v${version}` : null)),

    h('div', { className: 'wpswf-layout' },
      h('div', { className: 'wpswf-panel' },
        h('div', { className: 'wpswf-panelBody' },
          h('div', { className: 'wpswf-panelTitle' },
            h('h3', null, '连接配置'),
            h('span', null, 'Secret 仅保存在本机凭据库')),
          h('div', { className: 'wpswf-fieldGrid' },
            h('label', { className: 'wpswf-field' },
              h('span', { className: 'wpswf-label' }, 'App ID'),
              h('input', {
                className: 'wpswf-input',
                value: form.appId,
                placeholder: 'AK2024xxxxxxxx',
                onChange: (event) => setForm({ ...form, appId: event.target.value }),
              })),
            h('label', { className: 'wpswf-field' },
              h('span', { className: 'wpswf-label' }, 'App Secret'),
              h('input', {
                className: 'wpswf-input',
                type: 'password',
                value: form.appSecret,
                placeholder: model.configured ? '已保存；留空保持不变' : '开放平台 App Secret',
                autoComplete: 'new-password',
                onChange: (event) => setForm({ ...form, appSecret: event.target.value }),
              })),
            h('div', { className: 'wpswf-field', 'data-span': 'full' },
              h('span', { className: 'wpswf-label' }, '事件通道'),
              h(TransportPicker, {
                value: form.transport,
                onChange: (transport) => setForm({ ...form, transport }),
              })),
            form.transport === WPS_TRANSPORTS.HTTP
              ? h('label', { className: 'wpswf-field' },
                  h('span', { className: 'wpswf-label' }, '本机回调端口'),
                  h('input', {
                    className: 'wpswf-input',
                    type: 'number',
                    min: 1024,
                    max: 65535,
                    value: form.callbackPort,
                    onChange: (event) => setForm({ ...form, callbackPort: event.target.value }),
                  }))
              : null),
          model.callbackUrl
            ? h('div', { className: 'wpswf-meta' },
                '回调地址：',
                h('code', null, model.callbackUrl),
                '。请用 tunnel 暴露后填入 WPS 后台。')
            : form.transport === WPS_TRANSPORTS.WEBSOCKET
              ? h('div', { className: 'wpswf-meta' }, 'WebSocket 模式无需在后台配置 HTTP 回调 URL。')
              : null,
          error ? h(Alert, { kind: 'error', title: '操作失败' }, error) : null,
          notice ? h(Alert, { kind: 'success', title: '已完成' }, notice) : null,
          model.health?.lastError?.message
            ? h(Alert, { kind: 'error', title: '最近错误' }, model.health.lastError.message)
            : null,
          h('div', { className: 'wpswf-actions' },
            h(Button, {
              kind: 'primary',
              disabled: Boolean(busy) || !form.appId || (!form.appSecret && !model.configured),
              onClick: () => void run('save', () => invoke(WPS_RPC_ENDPOINTS.configure, {
                appId: form.appId,
                ...(form.appSecret ? { appSecret: form.appSecret } : {}),
                transport: form.transport,
                callbackPort: Number(form.callbackPort),
                mode: WPS_MODES.HARNESS,
              })),
            }, busy === 'save' ? '启动中…' : '保存并启动'),
            h(Button, {
              disabled: !model.configured || Boolean(busy),
              onClick: () => void run('test', () => invoke(WPS_RPC_ENDPOINTS.test)),
            }, busy === 'test' ? '验证中…' : '验证凭据'),
            h(Button, {
              disabled: !model.configured || Boolean(busy),
              onClick: () => void run('reconnect', () => invoke(WPS_RPC_ENDPOINTS.reconnect)),
            }, '重新连接'),
            h(Button, {
              kind: 'danger',
              disabled: !model.configured || Boolean(busy),
              onClick: () => void run('remove', () => invoke(WPS_RPC_ENDPOINTS.remove, { confirm: true })),
            }, '移除配置')))),

      h('div', { className: 'wpswf-sideStack' },
        h(HealthPanel, { model }),
        h(GuidePanel))));
}
