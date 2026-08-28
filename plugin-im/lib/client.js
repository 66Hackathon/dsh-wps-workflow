window.__ModuleLoader__.load({
  id: "@66hackathon/dsh-wps",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin-src/client/index.js
var index_exports = {};
__export(index_exports, {
  WPS_PLUGIN_VERSION: () => WPS_PLUGIN_VERSION,
  WpsSettingsPage: () => WpsSettingsPage,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React3 = __toESM(require("react"), 1);

// package.json
var package_default = {
  name: "@66hackathon/dsh-wps",
  version: "1.0.0",
  description: "WPS \u534F\u4F5C IM \u673A\u5668\u4EBA\u6E20\u9053\uFF1A\u7FA4\u804A @ \u673A\u5668\u4EBA\u6216\u79C1\u804A\u9A71\u52A8\u672C\u673A DeepSeek Harness \u56DE\u7B54\u3002",
  keywords: [
    "deepseek-harness",
    "dsh",
    "dsh-plugin",
    "wps",
    "kdocs",
    "im",
    "chatbot"
  ],
  author: {
    name: "66Hackathon",
    url: "https://github.com/66Hackathon"
  },
  license: "MIT",
  repository: {
    type: "git",
    url: "git+https://github.com/66Hackathon/dsh-wps-workflow.git",
    directory: "plugin-im"
  },
  bugs: {
    url: "https://github.com/66Hackathon/dsh-wps-workflow/issues"
  },
  homepage: "https://github.com/66Hackathon/dsh-wps-workflow#readme",
  type: "module",
  main: "./lib/index.js",
  exports: {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  files: [
    "bin",
    "cordis.patch.yml",
    "lib",
    "plugin-src",
    "scripts",
    "src",
    "README.md",
    "IMPLEMENTATION.md"
  ],
  bin: {
    "dsh-wps": "bin/dsh-wps.mjs"
  },
  dsh: {
    bundle: {
      patch: "./cordis.patch.yml"
    },
    client: {
      inject: [
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-locale"
      ],
      platform: "web"
    }
  },
  scripts: {
    build: "node plugin-src/client/build.mjs && node plugin-src/host/build.mjs",
    test: "node --test test/channels/wps/*.test.mjs",
    "test:wps": "node --test test/channels/wps/*.test.mjs",
    "wps:verify": "node scripts/wps-debug.mjs verify",
    "wps:stream-test": "node scripts/wps-stream-test.mjs",
    "wps:simulate": "node scripts/wps-debug.mjs simulate",
    "wps:listen": "node scripts/wps-debug.mjs listen",
    "wps:echo": "node scripts/wps-debug.mjs echo",
    check: "npm run build && npm test"
  },
  engines: {
    node: ">=22.19"
  },
  devDependencies: {
    esbuild: "0.25.9",
    react: "18.3.1",
    "react-dom": "18.3.1"
  }
};

// src/channels/wps/protocol.mjs
var WPS_RPC_CHANNEL = "/wps";
var WPS_RPC_ENDPOINTS = Object.freeze({
  status: "status",
  configure: "configure",
  reconnect: "reconnect",
  test: "test",
  remove: "remove"
});
var WPS_TRANSPORTS = Object.freeze({
  WEBSOCKET: "websocket",
  HTTP: "http"
});
var WPS_MODES = Object.freeze({
  ECHO: "echo",
  HARNESS: "harness"
});

// plugin-src/client/channels/wps/api.js
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function unwrapWpsRpc(result) {
  if (!record(result) || typeof result.ok !== "boolean") {
    throw new Error("WPS \u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94");
  }
  if (!result.ok) {
    const error = new Error(typeof result.error?.message === "string" ? result.error.message : "WPS \u64CD\u4F5C\u5931\u8D25");
    error.code = typeof result.error?.code === "string" ? result.error.code : "wps-rpc-error";
    throw error;
  }
  return result.value;
}
function normalizeWpsStatus(value) {
  if (!record(value) || value.configured !== true) {
    return {
      configured: false,
      connected: false,
      state: "unconfigured",
      mode: WPS_MODES.HARNESS,
      config: null,
      transport: null,
      callbackUrl: null,
      health: null
    };
  }
  return {
    configured: true,
    connected: value.connected === true,
    state: typeof value.state === "string" ? value.state : "idle",
    mode: value.mode ?? WPS_MODES.ECHO,
    config: record(value.config) ? value.config : null,
    transport: value.transport ?? null,
    callbackUrl: typeof value.callbackUrl === "string" ? value.callbackUrl : null,
    health: record(value.health) ? value.health : null
  };
}

// plugin-src/client/channels/wps/index.js
var React2 = __toESM(require("react"), 1);

// plugin-src/client/i18n.js
var React = __toESM(require("react"), 1);
var WPS_LOCALE_NAMESPACE = "dsh-wps";
var EN = Object.freeze({
  "$locale": "en",
  "WPS \u534F\u4F5C": "WPS Collaboration",
  "WPS \u8BBE\u7F6E\u9875\u7F3A\u5C11 RPC \u8FDE\u63A5": "WPS settings are missing an RPC connection",
  "\u6B63\u5728\u8BFB\u53D6 WPS \u914D\u7F6E\u2026": "Loading WPS configuration\u2026",
  "Echo \u5DF2\u8FDE\u63A5": "Echo connected",
  "Harness \u5DF2\u8FDE\u63A5": "Harness connected",
  "\u5C1A\u672A\u914D\u7F6E": "Not configured",
  "\u8FDE\u63A5\u672A\u5C31\u7EEA": "Connection not ready",
  "\u5DF2\u914D\u7F6E": "Configured",
  "\u4F01\u4E1A\u5E94\u7528\u51ED\u636E": "Enterprise app credentials",
  "Secret \u53EA\u5199\u5165\u672C\u673A\u51ED\u636E\u5B58\u50A8": "Secret is stored only in the local credential store",
  "\u5DF2\u5B89\u5168\u4FDD\u5B58\uFF1B\u7559\u7A7A\u5219\u4FDD\u6301\u4E0D\u53D8": "Saved securely; leave blank to keep the current value",
  "\u5F00\u653E\u5E73\u53F0 App Secret": "Open Platform App Secret",
  "\u4E8B\u4EF6\u901A\u9053": "Event transport",
  "WebSocket\uFF08\u63A8\u8350\uFF0C\u672C\u5730\u514D tunnel\uFF09": "WebSocket (recommended; no tunnel for local dev)",
  "HTTP \u56DE\u8C03\uFF08\u9700\u516C\u7F51 tunnel\uFF09": "HTTP callback (requires a public tunnel)",
  "\u672C\u673A\u56DE\u8C03\u7AEF\u53E3": "Local callback port",
  "\u5F53\u524D\u5E94\u7528\uFF1A": "Current app: ",
  "\u56DE\u8C03\u5730\u5740\uFF1A": "Callback URL: ",
  "\uFF08\u8BF7\u7528 tunnel \u66B4\u9732\u540E\u586B\u5165 WPS \u540E\u53F0\uFF09": " (expose with a tunnel and enter it in the WPS console)",
  "WebSocket \u6A21\u5F0F\u4E0D\u9700\u8981\u5728\u540E\u53F0\u914D\u7F6E HTTP \u56DE\u8C03 URL\u3002": "WebSocket mode does not require an HTTP callback URL in the console.",
  "WPS \u534F\u4F5C\u673A\u5668\u4EBA\u5DF2\u542F\u52A8\u3002\u8BF7\u5728\u7FA4\u804A @ \u673A\u5668\u4EBA\u6216\u79C1\u804A\u53D1\u9001\u95EE\u9898\u3002": "WPS bot is running. @mention the bot in a group or send a DM to ask questions.",
  "\u51ED\u636E\u9A8C\u8BC1\u901A\u8FC7\u3002": "Credentials verified.",
  "\u5DF2\u91CD\u65B0\u8FDE\u63A5\u4E8B\u4EF6\u901A\u9053\u3002": "Event transport reconnected.",
  "WPS \u914D\u7F6E\u5DF2\u79FB\u9664\u3002": "WPS configuration removed.",
  "\u542F\u52A8\u4E2D\u2026": "Starting\u2026",
  "\u4FDD\u5B58\u5E76\u542F\u52A8": "Save and start",
  "\u9A8C\u8BC1\u4E2D\u2026": "Verifying\u2026",
  "\u9A8C\u8BC1\u51ED\u636E": "Verify credentials",
  "\u91CD\u65B0\u8FDE\u63A5": "Reconnect",
  "\u79FB\u9664\u914D\u7F6E": "Remove configuration",
  "\u6D4B\u8BD5\uFF1A\u5728 WPS \u534F\u4F5C\u7FA4\u804A @ \u4F60\u7684\u5E94\u7528\u673A\u5668\u4EBA\u53D1\u9001\u95EE\u9898\uFF0C\u6216\u4F7F\u7528 /help \u67E5\u770B\u547D\u4EE4\u3002": "Test: in a WPS Collaboration group, @mention your app bot and send a question, or use /help for commands.",
  "WPS \u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94": "WPS returned an unrecognized response",
  "WPS \u64CD\u4F5C\u5931\u8D25": "WPS operation failed",
  "\u8BF7\u6539\u7528 localhost \u91CD\u65B0\u6253\u5F00": "Reopen with localhost",
  "\u9875\u9762\u4F1A\u5728\u5F53\u524D\u7AEF\u53E3\u91CD\u65B0\u6253\u5F00\uFF0C\u673A\u5668\u4EBA\u914D\u7F6E\u4E0D\u4F1A\u6539\u53D8\u3002": "The page will reopen on the same port; bot settings stay unchanged.",
  "\u4F7F\u7528 localhost \u91CD\u65B0\u6253\u5F00": "Reopen with localhost"
});
var ZH = Object.freeze({ "$locale": "zh" });
var translator = null;
function setWpsTranslator(next) {
  translator = typeof next === "function" ? next : null;
}
function isEnglish() {
  return translator?.("$locale") === "en";
}
function translate(value) {
  if (!isEnglish()) return value;
  return EN[value] ?? value;
}
function localizeText(value) {
  if (typeof value !== "string") return value;
  return translate(value);
}
var LOCALIZED_PROPS = Object.freeze(["aria-label", "alt", "placeholder", "title"]);
function localizeChild(child) {
  if (typeof child === "string") return localizeText(child);
  if (Array.isArray(child)) return child.map(localizeChild);
  return child;
}
function h(type, props, ...children) {
  let localizedProps = props;
  if (props) {
    for (const key of LOCALIZED_PROPS) {
      if (typeof props[key] === "string") {
        localizedProps = localizedProps === props ? { ...props } : localizedProps;
        localizedProps[key] = localizeText(props[key]);
      }
    }
  }
  return React.createElement(type, localizedProps, ...children.map(localizeChild));
}
var zh = ZH;
var en = EN;

// plugin-src/client/channel-logos.js
function dimensions(size) {
  return size ? { width: size, height: size } : null;
}
function WpsLogoGlyph({ size } = {}) {
  return h(
    "svg",
    {
      ...dimensions(size),
      viewBox: "0 0 24 24",
      focusable: "false",
      "aria-hidden": "true",
      "data-im-channel-logo": "wps"
    },
    h("path", {
      fill: "currentColor",
      d: "M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V6A1.5 1.5 0 0 1 4 4.5Zm2.2 3.2v1.6h2.2V7.7H6.2Zm4.4 0v1.6h2.2V7.7h-2.2Zm-4.4 3.8v1.6h2.2v-1.6H6.2Zm4.4 0v1.6h2.2v-1.6h-2.2ZM6.2 16v2.8h3.4V16H6.2Z"
    }),
    h("path", {
      fill: "currentColor",
      d: "M17.8 9.2h1.4v2.8h2.8v1.4h-2.8v2.8h-1.4v-2.8h-2.8v-1.4h2.8V9.2Z"
    })
  );
}

// plugin-src/client/channels/wps/index.js
function Button({ children, kind = "secondary", ...props }) {
  const mapped = kind === "primary" ? "primary" : kind === "danger" ? "danger" : kind === "quiet" ? "ghost" : "secondary";
  return h("button", { ...props, type: "button", className: "wpswf-btn", "data-kind": mapped }, children);
}
function Alert({ kind, title, children }) {
  const icon = kind === "error" ? "!" : kind === "success" ? "\u2713" : "i";
  return h(
    "div",
    { className: "wpswf-alert", "data-kind": kind, role: kind === "error" ? "alert" : "status" },
    h("span", { className: "wpswf-alertIcon", "aria-hidden": "true" }, icon),
    h("div", null, title ? h("strong", null, title) : null, h("p", null, children))
  );
}
function statusMeta(model) {
  if (model.connected) {
    return {
      tone: "success",
      label: model.mode === WPS_MODES.ECHO ? "Echo \u5DF2\u8FDE\u63A5" : "Harness \u5DF2\u8FDE\u63A5"
    };
  }
  if (!model.configured) return { tone: "idle", label: "\u5C1A\u672A\u914D\u7F6E" };
  if (model.state === "disconnected") return { tone: "idle", label: "\u8FDE\u63A5\u672A\u5C31\u7EEA" };
  return { tone: "idle", label: "\u5DF2\u914D\u7F6E\uFF0C\u5F85\u8FDE\u63A5" };
}
function TransportPicker({ value, onChange }) {
  const options = [
    {
      id: WPS_TRANSPORTS.WEBSOCKET,
      title: "WebSocket",
      desc: "\u63A8\u8350\u3002\u672C\u5730\u5F00\u53D1\u514D tunnel\uFF0C\u4E8B\u4EF6\u5B9E\u65F6\u63A8\u9001\u3002"
    },
    {
      id: WPS_TRANSPORTS.HTTP,
      title: "HTTP \u56DE\u8C03",
      desc: "\u9700\u516C\u7F51 tunnel\uFF0C\u5C06\u672C\u673A\u7AEF\u53E3\u66B4\u9732\u7ED9 WPS \u540E\u53F0\u3002"
    }
  ];
  return h(
    "div",
    { className: "wpswf-transportRow", role: "radiogroup", "aria-label": "\u4E8B\u4EF6\u901A\u9053" },
    options.map((option) => h(
      "button",
      {
        key: option.id,
        type: "button",
        className: "wpswf-transportCard",
        "data-active": String(value === option.id),
        "aria-pressed": value === option.id,
        onClick: () => onChange(option.id)
      },
      h("strong", null, option.title),
      h("span", null, option.desc)
    ))
  );
}
function GuidePanel() {
  const steps = [
    { title: "\u521B\u5EFA\u4F01\u4E1A\u5E94\u7528", body: "\u5728 365 \u5F00\u653E\u5E73\u53F0\u83B7\u53D6 App ID \u4E0E App Secret\uFF0C\u5E76\u5F00\u901A IM \u53D1\u6D88\u606F\u6743\u9650\u3002" },
    { title: "\u4FDD\u5B58\u5E76\u542F\u52A8", body: "\u586B\u5199\u51ED\u636E\u540E\u70B9\u51FB\u300C\u4FDD\u5B58\u5E76\u542F\u52A8\u300D\uFF0C\u7B49\u5F85\u72B6\u6001\u53D8\u4E3A\u5DF2\u8FDE\u63A5\u3002" },
    { title: "\u7FA4\u91CC @ \u673A\u5668\u4EBA", body: "\u5728 WPS \u534F\u4F5C\u7FA4\u804A @ \u673A\u5668\u4EBA\u63D0\u95EE\uFF0C\u6216\u79C1\u804A\u76F4\u63A5\u53D1\u9001\uFF1B\u53EF\u7528 /help \u67E5\u770B\u547D\u4EE4\u3002" }
  ];
  return h(
    "div",
    { className: "wpswf-panel" },
    h(
      "div",
      { className: "wpswf-panelBody" },
      h(
        "div",
        { className: "wpswf-panelTitle" },
        h("h3", null, "\u5FEB\u901F\u4E0A\u624B"),
        h("span", null, "3 \u6B65\u5B8C\u6210\u63A5\u5165")
      ),
      h(
        "ol",
        { className: "wpswf-guideList" },
        steps.map((step, index) => h(
          "li",
          { key: step.title, className: "wpswf-guideItem" },
          h("span", { className: "wpswf-step" }, String(index + 1)),
          h(
            "div",
            null,
            h("strong", null, step.title),
            h("p", null, step.body)
          )
        ))
      )
    )
  );
}
function HealthPanel({ model }) {
  const rows = [
    ["\u8FD0\u884C\u6A21\u5F0F", model.mode === WPS_MODES.ECHO ? "Echo" : "Harness"],
    ["\u4E8B\u4EF6\u901A\u9053", model.transport === WPS_TRANSPORTS.HTTP ? "HTTP \u56DE\u8C03" : "WebSocket"],
    ["\u5E94\u7528\u6807\u8BC6", model.config?.appIdMasked ?? "\u2014"],
    ["\u8FDE\u63A5\u72B6\u6001", model.connected ? "\u5DF2\u8FDE\u63A5" : model.configured ? "\u672A\u8FDE\u63A5" : "\u672A\u914D\u7F6E"]
  ];
  return h(
    "div",
    { className: "wpswf-panel" },
    h(
      "div",
      { className: "wpswf-panelBody" },
      h(
        "div",
        { className: "wpswf-panelTitle" },
        h("h3", null, "\u8FD0\u884C\u6982\u89C8"),
        h("span", null, "\u672C\u673A\u63D2\u4EF6\u72B6\u6001")
      ),
      h(
        "dl",
        { className: "wpswf-kv" },
        rows.map(([label, value]) => h(
          "div",
          { key: label, className: "wpswf-kvRow" },
          h("dt", null, label),
          h("dd", null, value)
        ))
      )
    )
  );
}
function WpsSettingsTab({ rpcCall, version }) {
  const [model, setModel] = React2.useState(normalizeWpsStatus());
  const [phase, setPhase] = React2.useState("loading");
  const [busy, setBusy] = React2.useState("");
  const [error, setError] = React2.useState("");
  const [notice, setNotice] = React2.useState("");
  const [form, setForm] = React2.useState({
    appId: "",
    appSecret: "",
    transport: WPS_TRANSPORTS.WEBSOCKET,
    callbackPort: "18765"
  });
  const invoke = React2.useCallback(async (endpoint, payload = {}) => {
    if (typeof rpcCall !== "function") throw new Error("WPS \u8BBE\u7F6E\u9875\u7F3A\u5C11 RPC \u8FDE\u63A5");
    return unwrapWpsRpc(await rpcCall(endpoint, payload));
  }, [rpcCall]);
  const adopt = React2.useCallback((value) => {
    const next = normalizeWpsStatus(value);
    setModel(next);
    if (next.config?.appIdMasked) {
      setForm((current) => ({
        ...current,
        appId: current.appId || "",
        transport: next.transport ?? WPS_TRANSPORTS.WEBSOCKET,
        callbackPort: String(next.config.callbackPort ?? 18765),
        appSecret: ""
      }));
    }
    return next;
  }, []);
  const load = React2.useCallback(async () => {
    try {
      adopt(await invoke(WPS_RPC_ENDPOINTS.status));
      setPhase("ready");
      setError("");
    } catch (caught) {
      setPhase("error");
      setError(caught.message);
    }
  }, [adopt, invoke]);
  React2.useEffect(() => {
    void load();
  }, [load]);
  const run = async (name2, operation) => {
    setBusy(name2);
    setError("");
    setNotice("");
    try {
      const value = await operation();
      adopt(value);
      if (name2 === "save") setNotice("\u673A\u5668\u4EBA\u5DF2\u542F\u52A8\u3002\u8BF7\u5728\u7FA4\u804A @ \u673A\u5668\u4EBA\u6216\u79C1\u804A\u53D1\u9001\u95EE\u9898\u3002");
      if (name2 === "test") setNotice("\u51ED\u636E\u9A8C\u8BC1\u901A\u8FC7\uFF0C\u53EF\u4EE5\u5F00\u59CB\u8FDE\u63A5\u4E8B\u4EF6\u901A\u9053\u3002");
      if (name2 === "reconnect") setNotice("\u5DF2\u91CD\u65B0\u8FDE\u63A5\u4E8B\u4EF6\u901A\u9053\u3002");
      if (name2 === "remove") setNotice("WPS \u914D\u7F6E\u5DF2\u79FB\u9664\u3002");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy("");
    }
  };
  const status = statusMeta(model);
  if (phase === "loading") {
    return h(
      "div",
      { className: "wpswf-page", "aria-busy": "true" },
      h(
        "div",
        { className: "wpswf-panel" },
        h(
          "div",
          { className: "wpswf-loading" },
          h("span", { className: "wpswf-spinner" }),
          "\u6B63\u5728\u8BFB\u53D6 WPS \u914D\u7F6E\u2026"
        )
      )
    );
  }
  return h(
    "section",
    { className: "wpswf-page", "aria-label": "WPS \u534F\u4F5C\u8BBE\u7F6E" },
    h(
      "header",
      { className: "wpswf-hero" },
      h(
        "div",
        { className: "wpswf-heroMain" },
        h("span", { className: "wpswf-logo", "aria-hidden": "true" }, h(WpsLogoGlyph)),
        h(
          "div",
          null,
          h("p", { className: "wpswf-eyebrow" }, "WPS Workflow"),
          h("h2", null, "WPS \u534F\u4F5C\u673A\u5668\u4EBA"),
          h("p", null, "\u628A WPS \u7FA4\u804A\u4E0E\u79C1\u804A\u63A5\u5230\u672C\u673A DeepSeek Harness\uFF0C\u652F\u6301\u6D41\u5F0F\u5361\u7247\u56DE\u590D\u4E0E\u5B8C\u6574\u4F1A\u8BDD\u547D\u4EE4\u3002")
        )
      ),
      h(
        "span",
        { className: "wpswf-status", "data-tone": status.tone },
        h("span", { className: "wpswf-statusDot" }),
        status.label,
        version ? ` \xB7 v${version}` : null
      )
    ),
    h(
      "div",
      { className: "wpswf-layout" },
      h(
        "div",
        { className: "wpswf-panel" },
        h(
          "div",
          { className: "wpswf-panelBody" },
          h(
            "div",
            { className: "wpswf-panelTitle" },
            h("h3", null, "\u8FDE\u63A5\u914D\u7F6E"),
            h("span", null, "Secret \u4EC5\u4FDD\u5B58\u5728\u672C\u673A\u51ED\u636E\u5E93")
          ),
          h(
            "div",
            { className: "wpswf-fieldGrid" },
            h(
              "label",
              { className: "wpswf-field" },
              h("span", { className: "wpswf-label" }, "App ID"),
              h("input", {
                className: "wpswf-input",
                value: form.appId,
                placeholder: "AK2024xxxxxxxx",
                onChange: (event) => setForm({ ...form, appId: event.target.value })
              })
            ),
            h(
              "label",
              { className: "wpswf-field" },
              h("span", { className: "wpswf-label" }, "App Secret"),
              h("input", {
                className: "wpswf-input",
                type: "password",
                value: form.appSecret,
                placeholder: model.configured ? "\u5DF2\u4FDD\u5B58\uFF1B\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8" : "\u5F00\u653E\u5E73\u53F0 App Secret",
                autoComplete: "new-password",
                onChange: (event) => setForm({ ...form, appSecret: event.target.value })
              })
            ),
            h(
              "div",
              { className: "wpswf-field", "data-span": "full" },
              h("span", { className: "wpswf-label" }, "\u4E8B\u4EF6\u901A\u9053"),
              h(TransportPicker, {
                value: form.transport,
                onChange: (transport) => setForm({ ...form, transport })
              })
            ),
            form.transport === WPS_TRANSPORTS.HTTP ? h(
              "label",
              { className: "wpswf-field" },
              h("span", { className: "wpswf-label" }, "\u672C\u673A\u56DE\u8C03\u7AEF\u53E3"),
              h("input", {
                className: "wpswf-input",
                type: "number",
                min: 1024,
                max: 65535,
                value: form.callbackPort,
                onChange: (event) => setForm({ ...form, callbackPort: event.target.value })
              })
            ) : null
          ),
          model.callbackUrl ? h(
            "div",
            { className: "wpswf-meta" },
            "\u56DE\u8C03\u5730\u5740\uFF1A",
            h("code", null, model.callbackUrl),
            "\u3002\u8BF7\u7528 tunnel \u66B4\u9732\u540E\u586B\u5165 WPS \u540E\u53F0\u3002"
          ) : form.transport === WPS_TRANSPORTS.WEBSOCKET ? h("div", { className: "wpswf-meta" }, "WebSocket \u6A21\u5F0F\u65E0\u9700\u5728\u540E\u53F0\u914D\u7F6E HTTP \u56DE\u8C03 URL\u3002") : null,
          error ? h(Alert, { kind: "error", title: "\u64CD\u4F5C\u5931\u8D25" }, error) : null,
          notice ? h(Alert, { kind: "success", title: "\u5DF2\u5B8C\u6210" }, notice) : null,
          model.health?.lastError?.message ? h(Alert, { kind: "error", title: "\u6700\u8FD1\u9519\u8BEF" }, model.health.lastError.message) : null,
          h(
            "div",
            { className: "wpswf-actions" },
            h(Button, {
              kind: "primary",
              disabled: Boolean(busy) || !form.appId || !form.appSecret && !model.configured,
              onClick: () => void run("save", () => invoke(WPS_RPC_ENDPOINTS.configure, {
                appId: form.appId,
                ...form.appSecret ? { appSecret: form.appSecret } : {},
                transport: form.transport,
                callbackPort: Number(form.callbackPort),
                mode: WPS_MODES.HARNESS
              }))
            }, busy === "save" ? "\u542F\u52A8\u4E2D\u2026" : "\u4FDD\u5B58\u5E76\u542F\u52A8"),
            h(Button, {
              disabled: !model.configured || Boolean(busy),
              onClick: () => void run("test", () => invoke(WPS_RPC_ENDPOINTS.test))
            }, busy === "test" ? "\u9A8C\u8BC1\u4E2D\u2026" : "\u9A8C\u8BC1\u51ED\u636E"),
            h(Button, {
              disabled: !model.configured || Boolean(busy),
              onClick: () => void run("reconnect", () => invoke(WPS_RPC_ENDPOINTS.reconnect))
            }, "\u91CD\u65B0\u8FDE\u63A5"),
            h(Button, {
              kind: "danger",
              disabled: !model.configured || Boolean(busy),
              onClick: () => void run("remove", () => invoke(WPS_RPC_ENDPOINTS.remove, { confirm: true }))
            }, "\u79FB\u9664\u914D\u7F6E")
          )
        )
      ),
      h(
        "div",
        { className: "wpswf-sideStack" },
        h(HealthPanel, { model }),
        h(GuidePanel)
      )
    )
  );
}

// plugin-src/client/channels/wps/styles.js
var WPS_STYLE_ID = "66hackathon-dsh-wps-settings";
var CSS = `
.wpswf-page {
  --wpswf-accent: #e8380d;
  --wpswf-accent-deep: #c62800;
  --wpswf-accent-soft: color-mix(in srgb, var(--wpswf-accent) 10%, transparent);
  --wpswf-ink: var(--dsw-alias-label-primary, #1f2329);
  --wpswf-muted: var(--dsw-alias-label-secondary, #646a73);
  --wpswf-faint: var(--dsw-alias-label-tertiary, #8f959e);
  --wpswf-line: var(--dsw-alias-border-l2, #e5e6eb);
  --wpswf-surface: var(--dsw-alias-bg-layer-1, #fff);
  --wpswf-canvas: var(--dsw-alias-bg-module-platform, #f7f8fa);
  width: 100%;
  max-width: 920px;
  color: var(--wpswf-ink);
  container-type: inline-size;
}
.wpswf-page *, .wpswf-page *::before, .wpswf-page *::after { box-sizing: border-box; }

.wpswf-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  align-items: center;
  margin-bottom: 16px;
  padding: 22px 24px;
  border: 1px solid color-mix(in srgb, var(--wpswf-accent) 18%, var(--wpswf-line));
  border-radius: 18px;
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--wpswf-accent) 16%, transparent), transparent 58%),
    linear-gradient(135deg, color-mix(in srgb, var(--wpswf-accent) 7%, var(--wpswf-surface)), var(--wpswf-surface) 72%);
  box-shadow: 0 10px 28px rgb(232 56 13 / 6%);
}
.wpswf-hero::after {
  content: '';
  position: absolute;
  right: -40px;
  bottom: -50px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--wpswf-accent) 8%, transparent);
  pointer-events: none;
}
.wpswf-heroMain { position: relative; z-index: 1; min-width: 0; display: flex; gap: 14px; align-items: flex-start; }
.wpswf-logo {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(145deg, var(--wpswf-accent-deep), var(--wpswf-accent));
  box-shadow: 0 8px 18px rgb(232 56 13 / 22%);
}
.wpswf-logo svg { width: 24px; height: 24px; display: block; }
.wpswf-eyebrow {
  margin: 0 0 4px;
  color: var(--wpswf-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.wpswf-hero h2 { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 700; }
.wpswf-hero p { margin: 6px 0 0; color: var(--wpswf-muted); font-size: 13px; line-height: 1.65; max-width: 52ch; }
.wpswf-status {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--wpswf-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 82%);
  backdrop-filter: blur(6px);
  color: var(--wpswf-muted);
  font-size: 12px;
  font-weight: 560;
  white-space: nowrap;
}
.wpswf-statusDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d97706;
  box-shadow: 0 0 0 3px rgb(217 119 6 / 14%);
}
.wpswf-status[data-tone="success"] .wpswf-statusDot {
  background: #20a162;
  box-shadow: 0 0 0 3px rgb(32 161 98 / 16%);
  animation: wpswf-pulse 2.2s ease-in-out infinite;
}
.wpswf-status[data-tone="idle"] .wpswf-statusDot { background: #aeb3bb; box-shadow: none; }
@keyframes wpswf-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: .82; }
}

.wpswf-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(240px, .85fr);
  gap: 14px;
  align-items: start;
}
.wpswf-panel {
  border: 1px solid var(--wpswf-line);
  border-radius: 16px;
  background: var(--wpswf-surface);
  box-shadow: 0 1px 2px rgb(31 35 41 / 4%);
}
.wpswf-panelBody { padding: 20px 22px; }
.wpswf-panelTitle {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.wpswf-panelTitle h3 { margin: 0; font-size: 15px; font-weight: 650; }
.wpswf-panelTitle span { color: var(--wpswf-faint); font-size: 11px; }

.wpswf-fieldGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 12px;
}
.wpswf-field { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.wpswf-field[data-span="full"] { grid-column: 1 / -1; }
.wpswf-label { color: var(--wpswf-muted); font-size: 12px; font-weight: 560; }
.wpswf-input,
.wpswf-select {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--wpswf-line);
  border-radius: 10px;
  background: var(--wpswf-surface);
  color: var(--wpswf-ink);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.wpswf-input:focus,
.wpswf-select:focus {
  border-color: color-mix(in srgb, var(--wpswf-accent) 55%, var(--wpswf-line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wpswf-accent) 12%, transparent);
}

.wpswf-transportRow { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.wpswf-transportCard {
  min-height: 88px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 13px;
  border: 1px solid var(--wpswf-line);
  border-radius: 12px;
  background: var(--wpswf-canvas);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.wpswf-transportCard:hover { border-color: color-mix(in srgb, var(--wpswf-accent) 28%, var(--wpswf-line)); }
.wpswf-transportCard[data-active="true"] {
  border-color: color-mix(in srgb, var(--wpswf-accent) 50%, var(--wpswf-line));
  background: color-mix(in srgb, var(--wpswf-accent) 6%, var(--wpswf-surface));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--wpswf-accent) 18%, transparent) inset;
}
.wpswf-transportCard strong { font-size: 13px; font-weight: 650; }
.wpswf-transportCard span { color: var(--wpswf-muted); font-size: 11px; line-height: 1.5; }

.wpswf-meta {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--wpswf-canvas);
  color: var(--wpswf-muted);
  font-size: 12px;
  line-height: 1.55;
}
.wpswf-meta code {
  padding: 1px 6px;
  border-radius: 6px;
  background: rgb(31 35 41 / 5%);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  word-break: break-all;
}

.wpswf-alert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 12px;
  padding: 11px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.55;
}
.wpswf-alert strong { display: block; margin-bottom: 2px; font-size: 12px; }
.wpswf-alert p { margin: 0; }
.wpswf-alert[data-kind="error"] {
  color: #b42318;
  background: #fff0ef;
  border: 1px solid #fecdca;
}
.wpswf-alert[data-kind="notice"] {
  color: var(--wpswf-muted);
  background: var(--wpswf-canvas);
  border: 1px solid var(--wpswf-line);
}
.wpswf-alert[data-kind="success"] {
  color: #067647;
  background: #ecfdf3;
  border: 1px solid #abefc6;
}
.wpswf-alertIcon {
  width: 18px;
  height: 18px;
  flex: none;
  margin-top: 1px;
}

.wpswf-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--wpswf-line);
}
.wpswf-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid var(--wpswf-line);
  border-radius: 10px;
  background: var(--wpswf-surface);
  color: var(--wpswf-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, transform .12s ease;
}
.wpswf-btn:hover:not(:disabled) {
  border-color: #c9cdd4;
  background: var(--wpswf-canvas);
}
.wpswf-btn:active:not(:disabled) { transform: translateY(1px); }
.wpswf-btn:disabled { opacity: .5; cursor: not-allowed; }
.wpswf-btn[data-kind="primary"] {
  color: #fff;
  border-color: var(--wpswf-accent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--wpswf-accent) 92%, white), var(--wpswf-accent));
  box-shadow: 0 6px 16px rgb(232 56 13 / 18%);
}
.wpswf-btn[data-kind="primary"]:hover:not(:disabled) {
  border-color: var(--wpswf-accent-deep);
  background: linear-gradient(180deg, var(--wpswf-accent), var(--wpswf-accent-deep));
}
.wpswf-btn[data-kind="ghost"] {
  border-color: transparent;
  background: transparent;
  color: var(--wpswf-muted);
}
.wpswf-btn[data-kind="danger"] {
  color: #d54941;
  border-color: #f3d6d3;
  background: #fff8f7;
}

.wpswf-sideStack { display: grid; gap: 12px; }
.wpswf-guideList { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.wpswf-guideItem {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
.wpswf-step {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--wpswf-accent-soft);
  color: var(--wpswf-accent-deep);
  font-size: 11px;
  font-weight: 700;
}
.wpswf-guideItem strong { display: block; margin-bottom: 2px; font-size: 13px; }
.wpswf-guideItem p { margin: 0; color: var(--wpswf-muted); font-size: 12px; line-height: 1.55; }

.wpswf-kv { display: grid; gap: 8px; margin: 0; }
.wpswf-kvRow {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  line-height: 1.5;
}
.wpswf-kvRow dt { margin: 0; color: var(--wpswf-faint); }
.wpswf-kvRow dd { margin: 0; color: var(--wpswf-ink); overflow-wrap: anywhere; }

.wpswf-loading {
  min-height: 220px;
  display: grid;
  place-items: center;
  gap: 12px;
  padding: 36px;
  color: var(--wpswf-muted);
  font-size: 13px;
}
.wpswf-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #eceef2;
  border-top-color: var(--wpswf-accent);
  border-radius: 50%;
  animation: wpswf-spin .8s linear infinite;
}
@keyframes wpswf-spin { to { transform: rotate(360deg); } }

.wpswf-loopback {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid #ffe7ba;
  border-radius: 12px;
  background: #fff7e8;
  color: #8c5b12;
  font-size: 12px;
  line-height: 1.55;
}
.wpswf-loopback strong { display: block; margin-bottom: 4px; color: #7a4b00; }
.wpswf-loopback p { margin: 0; }
.wpswf-loopback code { font-size: 11px; }
.wpswf-loopbackBtn {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #1677ff;
  border-radius: 8px;
  color: #fff;
  background: #1677ff;
  font: inherit;
  cursor: pointer;
}

@container (max-width: 760px) {
  .wpswf-hero { grid-template-columns: minmax(0, 1fr); }
  .wpswf-layout { grid-template-columns: minmax(0, 1fr); }
  .wpswf-fieldGrid, .wpswf-transportRow { grid-template-columns: minmax(0, 1fr); }
}
`;
function installWpsStyles() {
  if (typeof document === "undefined") return () => {
  };
  if (document.querySelector(`style[data-plugin-css="${WPS_STYLE_ID}"]`)) return () => {
  };
  const style = document.createElement("style");
  style.dataset.pluginCss = WPS_STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
  return () => style.remove();
}

// plugin-src/client/loopback-recovery.js
var TRANSPORT_FORBIDDEN = /^transport failure for \/[A-Za-z0-9._~-]+\/[A-Za-z0-9_$./~-]+: HTTP 403$/;
var LOOPBACK_RECOVERY_ERROR_CODE = "loopback-recovery-required";
var LOOPBACK_RECOVERY_ERROR_MESSAGE = "\u5F53\u524D\u5730\u5740\u4E0E\u6D4F\u89C8\u5668\u7684\u672C\u673A\u8BF7\u6C42\u6821\u9A8C\u4E0D\u517C\u5BB9\u3002\u8BF7\u4F7F\u7528\u4E0A\u65B9\u6309\u94AE\u6539\u7528 localhost \u91CD\u65B0\u6253\u5F00\u3002";
function isIpv4Loopback(hostname) {
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function createLoopbackRecovery(error, location) {
  if (!TRANSPORT_FORBIDDEN.test(error?.message ?? "")) return null;
  if (typeof location?.href !== "string") return null;
  try {
    const current = new URL(location.href);
    if (current.protocol !== "http:" || !isIpv4Loopback(current.hostname)) return null;
    current.hostname = "localhost";
    return Object.freeze({
      url: current.href,
      origin: current.origin
    });
  } catch {
    return null;
  }
}
function createLoopbackAwareRpcCall(rpcCall, {
  location,
  onRecovery
} = {}) {
  if (typeof rpcCall !== "function") throw new TypeError("rpcCall must be a function");
  return async (...args) => {
    try {
      return await rpcCall(...args);
    } catch (error) {
      const recovery = createLoopbackRecovery(error, location);
      if (!recovery) throw error;
      onRecovery?.(recovery);
      const presented = new Error(LOOPBACK_RECOVERY_ERROR_MESSAGE);
      presented.code = LOOPBACK_RECOVERY_ERROR_CODE;
      presented.cause = error;
      presented.recoveryUrl = recovery.url;
      throw presented;
    }
  };
}
function replacePageLocation(url, location = globalThis.location) {
  location?.replace?.(url);
}

// plugin-src/client/index.js
var name = "wps-settings";
var inject = ["slots", "connection", "locale"];
var WPS_PLUGIN_VERSION = package_default.version;
function LoopbackRecoveryNotice({ recovery, onNavigate = replacePageLocation }) {
  return h(
    "div",
    { className: "wpswf-loopback", role: "alert" },
    h(
      "div",
      null,
      h("strong", null, "\u8BF7\u6539\u7528 localhost \u91CD\u65B0\u6253\u5F00"),
      h("p", null, "\u5F53\u524D\u5730\u5740\u4E0E\u6D4F\u89C8\u5668\u7684\u672C\u673A\u8BF7\u6C42\u6821\u9A8C\u4E0D\u517C\u5BB9\u3002\u9875\u9762\u4F1A\u5728\u540C\u7AEF\u53E3\u91CD\u65B0\u6253\u5F00\uFF0C\u914D\u7F6E\u4E0D\u4F1A\u4E22\u5931\u3002"),
      h("code", null, recovery.origin)
    ),
    h("button", {
      type: "button",
      className: "wpswf-loopbackBtn",
      onClick: () => onNavigate(recovery.url)
    }, "\u4F7F\u7528 localhost \u91CD\u65B0\u6253\u5F00")
  );
}
function WpsSettingsPage({
  wpsRpcCall,
  browserLocation = globalThis.location,
  navigateToRecoveryUrl = replacePageLocation
}) {
  const [loopbackRecovery, setLoopbackRecovery] = React3.useState(null);
  const reportLoopbackRecovery = React3.useCallback((recovery) => {
    setLoopbackRecovery((current) => current?.url === recovery.url ? current : recovery);
  }, []);
  const rpcCall = React3.useMemo(() => createLoopbackAwareRpcCall(wpsRpcCall, {
    location: browserLocation,
    onRecovery: reportLoopbackRecovery
  }), [browserLocation, reportLoopbackRecovery, wpsRpcCall]);
  return h(
    React3.Fragment,
    null,
    loopbackRecovery ? h(LoopbackRecoveryNotice, {
      recovery: loopbackRecovery,
      onNavigate: navigateToRecoveryUrl
    }) : null,
    h(WpsSettingsTab, { rpcCall, version: WPS_PLUGIN_VERSION })
  );
}
function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(WPS_LOCALE_NAMESPACE, { zh, en }),
    "wps-settings: bilingual dictionaries"
  );
  const t = ctx.locale.bind(WPS_LOCALE_NAMESPACE);
  setWpsTranslator(t);
  ctx.effect(() => installWpsStyles(), "wps-settings: install styles");
  const wpsRpcCall = (endpoint, payload, signal) => ctx.connection.rpc.call(WPS_RPC_CHANNEL, endpoint, payload, signal);
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-wps-settings",
    order: 21,
    label: () => t("WPS \u534F\u4F5C"),
    locale: WPS_LOCALE_NAMESPACE,
    inject: () => ({ wpsRpcCall })
  }, WpsSettingsPage));
}

    return module.exports;
  }
});
