-- Monthly salaries: AdminUser.monthlySalary + SalaryPayment (additive).


-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "monthly_salary" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "salary_payments" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_by_id" INTEGER,
    "expense_id" INTEGER NOT NULL,
    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_expense_id_key" ON "salary_payments"("expense_id");

-- CreateIndex
CREATE INDEX "salary_payments_month_idx" ON "salary_payments"("month");

-- CreateIndex
CREATE INDEX "salary_payments_paid_by_id_idx" ON "salary_payments"("paid_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_staff_id_month_key" ON "salary_payments"("staff_id", "month");

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
