-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "edit_reason" TEXT,
ADD COLUMN     "edited_at" TIMESTAMP(3),
ADD COLUMN     "edited_by_id" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3),
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_id" INTEGER;

-- CreateIndex
CREATE INDEX "orders_edited_by_id_idx" ON "orders"("edited_by_id");

-- CreateIndex
CREATE INDEX "orders_voided_by_id_idx" ON "orders"("voided_by_id");

-- CreateIndex
CREATE INDEX "orders_payment_status_created_at_idx" ON "orders"("payment_status", "created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
