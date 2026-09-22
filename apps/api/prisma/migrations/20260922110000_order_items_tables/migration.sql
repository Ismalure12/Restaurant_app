-- Phase 4 (docs/system-blueprint.md 5 P2): order lines table + dining tables. Additive only.

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "menu_item_id" INTEGER,
    "name" TEXT NOT NULL,
    "category_name" TEXT,
    "option_name" TEXT,
    "extras" JSONB,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_menu_item_id_idx" ON "order_items"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_name_key" ON "dining_tables"("name");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one row per cart line already stored in orders.items. Defensive
-- casts (a bad value becomes 0/1/NULL rather than aborting); the menu item and
-- its category are looked up only when they still exist.
INSERT INTO "order_items" ("order_id", "menu_item_id", "name", "category_name", "option_name", "extras", "unit_price", "quantity", "line_total")
SELECT o."id",
       m."id",
       COALESCE(NULLIF(e.value->>'name', ''), 'Item'),
       c."name",
       NULLIF(e.value->>'optionName', ''),
       CASE WHEN jsonb_typeof(e.value->'extras') = 'array' AND jsonb_array_length(e.value->'extras') > 0 THEN e.value->'extras' END,
       COALESCE(CASE WHEN (e.value->>'unitPrice') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (e.value->>'unitPrice')::numeric END, 0),
       GREATEST(COALESCE(CASE WHEN (e.value->>'quantity') ~ '^[0-9]+$' THEN (e.value->>'quantity')::int END, 1), 1),
       ROUND(
         COALESCE(CASE WHEN (e.value->>'unitPrice') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (e.value->>'unitPrice')::numeric END, 0)
         * GREATEST(COALESCE(CASE WHEN (e.value->>'quantity') ~ '^[0-9]+$' THEN (e.value->>'quantity')::int END, 1), 1),
         2)
FROM "orders" o
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o."items"::jsonb) = 'array' THEN o."items"::jsonb ELSE '[]'::jsonb END) AS e(value)
LEFT JOIN "menu_items" m ON m."id" = CASE WHEN (e.value->>'itemId') ~ '^[0-9]+$' THEN (e.value->>'itemId')::int END
LEFT JOIN "categories" c ON c."id" = m."category_id";
