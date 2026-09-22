// The API owns the database: schema, migrations and seed all live in
// apps/api/prisma. Run Prisma commands from this package
// (`npm run db:migrate --workspace apps/api`, or `cd apps/api && npx prisma …`).
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Load this package's .env (never
// the web app's); variables already set in the environment (CI, Docker) win.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.cjs',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
