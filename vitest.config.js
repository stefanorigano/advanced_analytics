import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: {
        __MOD_VERSION__: '"test"',
    },
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['src/__tests__/setup.js'],
    },
});
