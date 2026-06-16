-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_type" TEXT NOT NULL DEFAULT 'delivery',
ADD COLUMN     "table_number" TEXT,
ALTER COLUMN "address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payment_sessions" ADD COLUMN     "order_type" TEXT NOT NULL DEFAULT 'delivery',
ADD COLUMN     "table_number" TEXT,
ALTER COLUMN "address" DROP NOT NULL;
