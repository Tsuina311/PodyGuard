import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __LAN_HOST__: JSON.stringify(''),
    __APP_VERSION__: JSON.stringify('test'),
    __APP_BUILD__: JSON.stringify('test'),
  },
  test: {
    reporters: ['default', 'junit'],
    outputFile: { junit: '../../reports/web.xml' },
    environment: 'node',
  },
});
