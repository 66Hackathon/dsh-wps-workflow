export const WPS_STYLE_ID = '66hackathon-dsh-wps-settings';

const CSS = `
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

export function installWpsStyles() {
  if (typeof document === 'undefined') return () => {};
  if (document.querySelector(`style[data-plugin-css="${WPS_STYLE_ID}"]`)) return () => {};
  const style = document.createElement('style');
  style.dataset.pluginCss = WPS_STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
  return () => style.remove();
}
