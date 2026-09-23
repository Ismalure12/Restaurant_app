import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Fixed test secrets — the suite never touches a real database (Prisma is mocked).
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-for-vitest-only',
      DATABASE_URL: 'postgres://test:test@127.0.0.1:1/never-connected',
      SIFALO_API_USER: 'test-user',
      SIFALO_API_KEY: 'test-key',
      PUBLIC_APP_URL: 'http://localhost:3100',
    },
    restoreMocks: true,
  },
});
