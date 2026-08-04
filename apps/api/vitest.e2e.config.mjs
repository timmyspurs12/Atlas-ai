import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['test/**/*.e2e-spec.ts'],
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
//# sourceMappingURL=vitest.e2e.config.mjs.map