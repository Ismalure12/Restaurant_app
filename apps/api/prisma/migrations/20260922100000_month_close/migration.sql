-- Phase 3 (docs/system-blueprint.md 3.3/3.5): suppliers, credit purchases, expense categories, stock counts, month close. Additive only.

-- AlterTable
ALTER TABLE "account_entries" ADD COLUMN     "supplier_payment_id" INTEGER;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "expense_id" INTEGER,
ADD COLUMN     "on_credit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supplier_id" INTEGER;

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'operating',

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_by_id" INTEGER,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" SERIAL NOT NULL,
    "counted_on" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMP(3),
    "created_by_id" INTEGER,
    "total_value" DECIMAL(12,2),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" SERIAL NOT NULL,
    "count_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "system_qty" DECIMAL(12,3) NOT NULL,
    "counted_qty" DECIMAL(12,3),
    "unit_cost" DECIMAL(10,4),

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_closes" (
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" INTEGER,
    "snapshot" JSONB NOT NULL,
    "reopened_at" TIMESTAMP(3),
    "reopen_reason" TEXT,

    CONSTRAINT "period_closes_pkey" PRIMARY KEY ("period")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_paid_at_idx" ON "supplier_payments"("supplier_id", "paid_at");

-- CreateIndex
CREATE INDEX "supplier_payments_account_id_idx" ON "supplier_payments"("account_id");

-- CreateIndex
CREATE INDEX "supplier_payments_paid_by_id_idx" ON "supplier_payments"("paid_by_id");

-- CreateIndex
CREATE INDEX "stock_counts_counted_on_idx" ON "stock_counts"("counted_on");

-- CreateIndex
CREATE INDEX "stock_counts_created_by_id_idx" ON "stock_counts"("created_by_id");

-- CreateIndex
CREATE INDEX "stock_count_lines_item_id_idx" ON "stock_count_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_count_id_item_id_key" ON "stock_count_lines"("count_id", "item_id");

-- CreateIndex
CREATE INDEX "period_closes_closed_by_id_idx" ON "period_closes"("closed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_entries_supplier_payment_id_key" ON "account_entries"("supplier_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_expense_id_key" ON "stock_movements"("expense_id");

-- CreateIndex
CREATE INDEX "stock_movements_supplier_id_idx" ON "stock_movements"("supplier_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_supplier_payment_id_fkey" FOREIGN KEY ("supplier_payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every category already used by an expense becomes a category row.
INSERT INTO "expense_categories" ("name", "kind")
SELECT DISTINCT e."category",
  CASE WHEN lower(e."category") = 'salaries' THEN 'payroll'
       WHEN lower(e."category") = 'purchases' THEN 'stock_purchase'
       ELSE 'operating' END
FROM "expenses" e
ON CONFLICT ("name") DO NOTHING;
