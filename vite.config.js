import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  base: '/voronoi/',
  plugins: [
    vue(),
    // Gzip压缩配置
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // 只压缩大于1KB的文件
      deleteOriginFile: false, // 保留原文件
      verbose: true, // 显示压缩信息
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5176,
  },
  assetsInclude: ['**/*.md'],
});

