import * as React from 'react';

export const WPS_LOCALE_NAMESPACE = 'dsh-wps';

const EN = Object.freeze({
  '$locale': 'en',
  'WPS 协作': 'WPS Collaboration',
  'WPS 设置页缺少 RPC 连接': 'WPS settings are missing an RPC connection',
  '正在读取 WPS 配置…': 'Loading WPS configuration…',
  'Echo 已连接': 'Echo connected',
  'Harness 已连接': 'Harness connected',
  '尚未配置': 'Not configured',
  '连接未就绪': 'Connection not ready',
  '已配置': 'Configured',
  '企业应用凭据': 'Enterprise app credentials',
  'Secret 只写入本机凭据存储': 'Secret is stored only in the local credential store',
  '已安全保存；留空则保持不变': 'Saved securely; leave blank to keep the current value',
  '开放平台 App Secret': 'Open Platform App Secret',
  '事件通道': 'Event transport',
  'WebSocket（推荐，本地免 tunnel）': 'WebSocket (recommended; no tunnel for local dev)',
  'HTTP 回调（需公网 tunnel）': 'HTTP callback (requires a public tunnel)',
  '本机回调端口': 'Local callback port',
  '当前应用：': 'Current app: ',
  '回调地址：': 'Callback URL: ',
  '（请用 tunnel 暴露后填入 WPS 后台）': ' (expose with a tunnel and enter it in the WPS console)',
  'WebSocket 模式不需要在后台配置 HTTP 回调 URL。': 'WebSocket mode does not require an HTTP callback URL in the console.',
  'WPS 协作机器人已启动。请在群聊 @ 机器人或私聊发送问题。': 'WPS bot is running. @mention the bot in a group or send a DM to ask questions.',
  '凭据验证通过。': 'Credentials verified.',
  '已重新连接事件通道。': 'Event transport reconnected.',
  'WPS 配置已移除。': 'WPS configuration removed.',
  '启动中…': 'Starting…',
  '保存并启动': 'Save and start',
  '验证中…': 'Verifying…',
  '验证凭据': 'Verify credentials',
  '重新连接': 'Reconnect',
  '移除配置': 'Remove configuration',
  '测试：在 WPS 协作群聊 @ 你的应用机器人发送问题，或使用 /help 查看命令。': 'Test: in a WPS Collaboration group, @mention your app bot and send a question, or use /help for commands.',
  'WPS 服务返回了无法识别的响应': 'WPS returned an unrecognized response',
  'WPS 操作失败': 'WPS operation failed',
  '请改用 localhost 重新打开': 'Reopen with localhost',
  '页面会在当前端口重新打开，机器人配置不会改变。': 'The page will reopen on the same port; bot settings stay unchanged.',
  '使用 localhost 重新打开': 'Reopen with localhost',
});

const ZH = Object.freeze({ '$locale': 'zh' });

let translator = null;

export function setWpsTranslator(next) {
  translator = typeof next === 'function' ? next : null;
}

function isEnglish() {
  return translator?.('$locale') === 'en';
}

function translate(value) {
  if (!isEnglish()) return value;
  return EN[value] ?? value;
}

export function localizeText(value) {
  if (typeof value !== 'string') return value;
  return translate(value);
}

const LOCALIZED_PROPS = Object.freeze(['aria-label', 'alt', 'placeholder', 'title']);

function localizeChild(child) {
  if (typeof child === 'string') return localizeText(child);
  if (Array.isArray(child)) return child.map(localizeChild);
  return child;
}

export function h(type, props, ...children) {
  let localizedProps = props;
  if (props) {
    for (const key of LOCALIZED_PROPS) {
      if (typeof props[key] === 'string') {
        localizedProps = localizedProps === props ? { ...props } : localizedProps;
        localizedProps[key] = localizeText(props[key]);
      }
    }
  }
  return React.createElement(type, localizedProps, ...children.map(localizeChild));
}

export const zh = ZH;
export const en = EN;
