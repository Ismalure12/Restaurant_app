# Lessons

## Prisma: Use migrate, not db push
Always use `npx prisma migrate dev --name <name>` during development, not `npx prisma db push`. Use `npx prisma migrate deploy` in production/CI. Migrate creates trackable SQL migration files in git.

## Corrections: Log to tasks/lessons.md
When told to remember/clock something, write it here — not to `.claude/` memory files. Follow CLAUDE.md instructions.

## Prisma 7 + Neon: Use @prisma/adapter-pg, not adapter-neon
`@prisma/adapter-neon` with `PrismaNeon` ignores the Pool connectionString (bug). `PrismaNeonHttp` works but doesn't support transactions. Use `@prisma/adapter-pg` with `PrismaPg(process.env.DATABASE_URL)` instead — it works with Neon and supports transactions.
