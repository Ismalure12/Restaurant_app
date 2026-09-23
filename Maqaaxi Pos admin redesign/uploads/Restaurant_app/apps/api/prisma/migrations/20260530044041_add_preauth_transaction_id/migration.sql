-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_transaction_id" TEXT,
ALTER COLUMN "status" SET DEFAULT 'pending';
