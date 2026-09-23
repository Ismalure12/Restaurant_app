-- Missing foreign-key indexes (Rule 03). Additive only: safe for the deployed code.
-- DropIndex
DROP INDEX "stock_movements_inventory_item_id_idx";

-- CreateIndex
CREATE INDEX "menu_items_category_id_idx" ON "menu_items"("category_id");

-- CreateIndex
CREATE INDEX "option_groups_menu_item_id_idx" ON "option_groups"("menu_item_id");

-- CreateIndex
CREATE INDEX "item_options_option_group_id_idx" ON "item_options"("option_group_id");

-- CreateIndex
CREATE INDEX "item_extras_menu_item_id_idx" ON "item_extras"("menu_item_id");

-- CreateIndex
CREATE INDEX "item_tags_tag_id_idx" ON "item_tags"("tag_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "stock_movements_inventory_item_id_created_at_idx" ON "stock_movements"("inventory_item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_staff_id_idx" ON "stock_movements"("staff_id");

-- CreateIndex
CREATE INDEX "expenses_staff_id_idx" ON "expenses"("staff_id");

