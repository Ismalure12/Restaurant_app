// The API owns the database: schema, migrations and seed all live in
// apps/api/prisma. Run Prisma commands from this package
// (`npm run db:migrate --workspace apps/api`, or `cd apps/api && npx prisma …`).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Load the repo's one root .env;
// variables already set in the environment (CI, Docker) win.
const rootEnv = path.join(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

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
