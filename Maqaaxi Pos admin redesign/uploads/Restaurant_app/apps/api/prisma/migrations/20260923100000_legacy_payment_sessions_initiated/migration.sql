-- Checkouts created before the payment reconciler existed have no
-- initiated_at, so there is no telling whether the customer was sent to
-- Sifalo. Treat them as possibly paid: the reconciler then asks Sifalo about
-- each one once (never creating an order for one older than 48 h by itself —
-- a paid one is flagged 'paid_late' for staff) instead of cleaning it up as
-- "never sent to pay". Data-only; old code ignores this column.
UPDATE "payment_sessions" SET "initiated_at" = "created_at" WHERE "initiated_at" IS NULL;
