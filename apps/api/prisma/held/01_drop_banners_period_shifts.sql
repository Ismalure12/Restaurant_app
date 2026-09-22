-- HELD — apply only AFTER the code that stopped using these is deployed.
-- (Banners, Category.period and clock-in/shifts were removed from the code in Round 4;
-- the deployed build still reads them, so dropping first would break the live menu.)
-- To apply: move this into prisma/migrations/<timestamp>_drop_banners_period_shifts/migration.sql
-- and run `npm run db:deploy`.
-- DropForeignKey
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_staff_id_fkey";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "period";

-- DropTable
DROP TABLE "banners";

-- DropTable
DROP TABLE "shifts";

