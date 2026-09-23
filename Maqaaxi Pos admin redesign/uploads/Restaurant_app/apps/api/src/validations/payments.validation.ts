// Zod schemas — Online payments (staff side).
import { z } from 'zod';

// Orders › Online payments: a manager removes a checkout that will never be an
// order (the customer was called / refunded in the Sifalo portal).
export const dismissPaymentSchema = z.object({
  reason: z.string({ error: 'Say why this payment is being dismissed' }).trim().min(3, 'Say why this payment is being dismissed').max(300),
});
