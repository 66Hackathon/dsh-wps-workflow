import { h } from './i18n.js';

function dimensions(size) {
  return size ? { width: size, height: size } : null;
}

export function WpsLogoGlyph({ size } = {}) {
  return h('svg', {
    ...dimensions(size),
    viewBox: '0 0 24 24',
    focusable: 'false',
    'aria-hidden': 'true',
    'data-im-channel-logo': 'wps',
  },
  h('path', {
    fill: 'currentColor',
    d: 'M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V6A1.5 1.5 0 0 1 4 4.5Zm2.2 3.2v1.6h2.2V7.7H6.2Zm4.4 0v1.6h2.2V7.7h-2.2Zm-4.4 3.8v1.6h2.2v-1.6H6.2Zm4.4 0v1.6h2.2v-1.6h-2.2ZM6.2 16v2.8h3.4V16H6.2Z',
  }),
  h('path', {
    fill: 'currentColor',
    d: 'M17.8 9.2h1.4v2.8h2.8v1.4h-2.8v2.8h-1.4v-2.8h-2.8v-1.4h2.8V9.2Z',
  }));
}
