-- Settings › Money: a per-account switch for which wallets staff can add
-- their own number to (Staff › Team) and have printed on their bills.
-- Additive; the running build ignores the column.
ALTER TABLE "money_accounts" ADD COLUMN     "staff_numbers" BOOLEAN NOT NULL DEFAULT false;

-- Nothing changes on day one: wallets that already hold staff numbers stay on.
UPDATE "money_accounts" SET "staff_numbers" = true
WHERE "kind" = 'wallet' AND "id" IN (SELECT DISTINCT "account_id" FROM "staff_accounts");
