-- Sifalo Pay hosted checkout (additive, expand-only).

-- AlterTable: the checkout session id Sifalo returns, kept so a pending
-- payment can be re-verified by polling.
ALTER TABLE "payment_sessions" ADD COLUMN     "sid" TEXT;

-- CreateIndex: one Sifalo payment can pay for one order only (replay guard).
-- NULLs (POS orders) are not considered equal, so they are unaffected.
CREATE UNIQUE INDEX "orders_payment_transaction_id_key" ON "orders"("payment_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_sessions_sid_key" ON "payment_sessions"("sid");
