-- Phase 1 (docs/system-blueprint.md §3): business money accounts, staff
-- collection numbers, the cash book and the audit log. Additive only —
-- the deployed build keeps working (new tables + nullable columns).

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "collected_by_id" INTEGER;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "paid_from_account_id" INTEGER;

-- CreateTable
CREATE TABLE "money_accounts" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "opening_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_accounts" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_entries" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "kind" TEXT NOT NULL,
    "business_day" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected_by_id" INTEGER,
    "order_id" INTEGER,
    "invoice_payment_id" INTEGER,
    "expense_id" INTEGER,
    "transfer_id" TEXT,
    "reverses_id" INTEGER,
    "note" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "money_accounts_label_key" ON "money_accounts"("label");

-- CreateIndex
CREATE INDEX "staff_accounts_account_id_idx" ON "staff_accounts"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_accounts_staff_id_account_id_key" ON "staff_accounts"("staff_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_entries_invoice_payment_id_key" ON "account_entries"("invoice_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_entries_expense_id_key" ON "account_entries"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_entries_reverses_id_key" ON "account_entries"("reverses_id");

-- CreateIndex
CREATE INDEX "account_entries_account_id_business_day_idx" ON "account_entries"("account_id", "business_day");

-- CreateIndex
CREATE INDEX "account_entries_business_day_collected_by_id_idx" ON "account_entries"("business_day", "collected_by_id");

-- CreateIndex
CREATE INDEX "account_entries_collected_by_id_idx" ON "account_entries"("collected_by_id");

-- CreateIndex
CREATE INDEX "account_entries_created_by_id_idx" ON "account_entries"("created_by_id");

-- CreateIndex
CREATE INDEX "account_entries_order_id_idx" ON "account_entries"("order_id");

-- CreateIndex
CREATE INDEX "account_entries_transfer_id_idx" ON "account_entries"("transfer_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "orders_collected_by_id_idx" ON "orders"("collected_by_id");

-- CreateIndex
CREATE INDEX "expenses_paid_from_account_id_idx" ON "expenses"("paid_from_account_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "money_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_invoice_payment_id_fkey" FOREIGN KEY ("invoice_payment_id") REFERENCES "invoice_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "account_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Starting business accounts ───────────────────────────────────────────
-- Cash, every wallet already configured in Settings (payment_accounts JSON,
-- kept in place for the deployed build), the Mastercard and Sifalo online.
INSERT INTO "money_accounts" ("kind", "label", "number", "sort_order", "updated_at")
VALUES ('cash', 'Cash', NULL, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;

INSERT INTO "money_accounts" ("kind", "label", "number", "sort_order", "updated_at")
SELECT 'wallet', trim(e.value->>'label'), NULLIF(trim(e.value->>'number'), ''), 10 + e.ordinality::int, CURRENT_TIMESTAMP
FROM "settings" s
CROSS JOIN LATERAL json_array_elements(s."value"::json) WITH ORDINALITY AS e(value, ordinality)
WHERE s."key" = 'payment_accounts'
  AND s."value" LIKE '[%'
  AND coalesce(trim(e.value->>'label'), '') <> ''
ON CONFLICT ("label") DO NOTHING;

INSERT INTO "money_accounts" ("kind", "label", "number", "sort_order", "updated_at")
VALUES ('card', 'Mastercard', NULL, 50, CURRENT_TIMESTAMP),
       ('gateway', 'Sifalo (online)', NULL, 60, CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;
