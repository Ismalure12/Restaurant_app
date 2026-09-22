-- Online clients (Sifalo payers) kept apart from Customer (the owing/account
-- list), plus reconciler bookkeeping on payment sessions. Additive only: safe
-- while the previous build is still deployed.

-- CreateTable
CREATE TABLE "online_clients" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_clients_phone_key" ON "online_clients"("phone");

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "client_id" INTEGER;

-- CreateIndex
CREATE INDEX "orders_client_id_idx" ON "orders"("client_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "online_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "payment_sessions" ADD COLUMN     "check_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "initiated_at" TIMESTAMP(3),
ADD COLUMN     "last_checked_at" TIMESTAMP(3),
ADD COLUMN     "last_result" TEXT;

-- CreateIndex
CREATE INDEX "payment_sessions_created_at_idx" ON "payment_sessions"("created_at");
