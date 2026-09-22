-- Open dine-in tabs, daily receipt numbers, close time and payment account
-- (additive, expand-only).

-- AlterTable
ALTER TABLE "invoice_payments" ADD COLUMN     "account" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "payment_account" TEXT,
ADD COLUMN     "receipt_day" TEXT,
ADD COLUMN     "receipt_no" INTEGER;

-- CreateTable
CREATE TABLE "receipt_counters" (
    "day" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("day")
);

-- Backfill. Every order that exists today was closed the moment it was
-- created (POS sales were pay-first, online orders are created once paid),
-- so its close time is its creation time. Receipt numbers are given to the
-- history per local day (Africa/Mogadishu, the BUSINESS_TZ default) in the
-- order the sales happened, and each day's counter continues from there.
UPDATE "orders" SET "closed_at" = "created_at";

WITH numbered AS (
  SELECT "id",
         to_char(("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Mogadishu', 'YYYY-MM-DD') AS day
  FROM "orders"
), ranked AS (
  SELECT n."id", n.day,
         ROW_NUMBER() OVER (PARTITION BY n.day ORDER BY o."created_at", o."id") AS no
  FROM numbered n JOIN "orders" o ON o."id" = n."id"
)
UPDATE "orders" o SET "receipt_day" = r.day, "receipt_no" = r.no
FROM ranked r WHERE o."id" = r."id";

INSERT INTO "receipt_counters" ("day", "last")
SELECT "receipt_day", MAX("receipt_no") FROM "orders"
WHERE "receipt_day" IS NOT NULL
GROUP BY "receipt_day";

-- CreateIndex
CREATE INDEX "orders_closed_at_idx" ON "orders"("closed_at");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_receipt_day_receipt_no_key" ON "orders"("receipt_day", "receipt_no");
