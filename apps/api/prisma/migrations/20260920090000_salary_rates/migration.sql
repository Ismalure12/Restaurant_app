-- Salary history: a monthly salary now applies from a month onward
-- (salary_rates), so a raise never rewrites the months before it.
-- admin_users.monthly_salary (added in the previous, never-deployed migration)
-- is moved into salary_rates and dropped.

-- CreateTable
CREATE TABLE "salary_rates" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "from_month" TEXT NOT NULL,
    "set_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_rates_set_by_id_idx" ON "salary_rates"("set_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_rates_staff_id_from_month_key" ON "salary_rates"("staff_id", "from_month");

-- AddForeignKey
ALTER TABLE "salary_rates" ADD CONSTRAINT "salary_rates_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_rates" ADD CONSTRAINT "salary_rates_set_by_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the salary on file was the only one ever known, so it covers every
-- earlier month too ('2000-01' = from the beginning).
INSERT INTO "salary_rates" ("staff_id", "amount", "from_month")
SELECT "id", "monthly_salary", '2000-01' FROM "admin_users" WHERE "monthly_salary" IS NOT NULL;

-- AlterTable
ALTER TABLE "admin_users" DROP COLUMN "monthly_salary";
