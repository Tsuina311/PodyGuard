import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: { junit: '../../reports/server.xml' },
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
});
