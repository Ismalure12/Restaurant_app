-- Phase 2 (docs/system-blueprint.md §3.4): day close + Z-report. Additive only.

-- CreateTable
CREATE TABLE "day_closes" (
    "business_day" TEXT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" INTEGER,
    "snapshot" JSONB NOT NULL,
    "reopened_at" TIMESTAMP(3),
    "reopened_by_id" INTEGER,
    "reopen_reason" TEXT,

    CONSTRAINT "day_closes_pkey" PRIMARY KEY ("business_day")
);

-- CreateTable
CREATE TABLE "day_close_lines" (
    "id" SERIAL NOT NULL,
    "business_day" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "opening" DECIMAL(12,2) NOT NULL,
    "money_in" DECIMAL(12,2) NOT NULL,
    "money_out" DECIMAL(12,2) NOT NULL,
    "expected" DECIMAL(12,2) NOT NULL,
    "counted" DECIMAL(12,2),

    CONSTRAINT "day_close_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_closes_closed_by_id_idx" ON "day_closes"("closed_by_id");

-- CreateIndex
CREATE INDEX "day_close_lines_account_id_idx" ON "day_close_lines"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_close_lines_business_day_account_id_key" ON "day_close_lines"("business_day", "account_id");

-- AddForeignKey
ALTER TABLE "day_closes" ADD CONSTRAINT "day_closes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_close_lines" ADD CONSTRAINT "day_close_lines_business_day_fkey" FOREIGN KEY ("business_day") REFERENCES "day_closes"("business_day") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_close_lines" ADD CONSTRAINT "day_close_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

