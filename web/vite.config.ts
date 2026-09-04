import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.TEAMSPACE_API_URL ?? 'http://10.213.21.202:8090';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0，局域网可访问
    port: 5173,
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
});
