import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 代理始终打本机后端；浏览器访问任意网卡 IP:5173 时，/api 仍由 Vite 转到本地 8090
const apiTarget = process.env.TEAMSPACE_API_URL ?? 'http://127.0.0.1:8090';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 别人用局域网 IP 打开时，HMR WebSocket 跟浏览器 Host 走
    hmr: {
      protocol: 'ws',
    },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // OAuth 登录/回调必须透传 302 与 Set-Cookie，不可在代理层跟随重定向
        followRedirects: false,
      },
      '/healthz': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, followRedirects: false },
      '/healthz': { target: apiTarget, changeOrigin: true },
    },
  },
});
