import { z } from 'zod';
import { EMAIL_RE, maxText, optionalMoneyText } from './common';

const base = {
  name: maxText(120, 'Name'),
  phone: maxText(40, 'Phone'),
  email: z.string().trim().min(1, 'Enter the staff member’s email').regex(EMAIL_RE, 'Enter a valid email, like name@example.com'),
  role: z.enum(['admin', 'manager', 'cashier', 'waiter'], { error: 'Choose a role' }),
};

// Each wallet's payment number is a `num_<accountId>` key (see users/page.jsx).
const numberField = z.string().trim().max(40, 'Number is too long (max 40 characters)');

export const editStaffSchema = z.object(base).catchall(numberField);

export const newStaffSchema = z.object({
  ...base,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  monthlySalary: optionalMoneyText('Enter a salary of 0 or more', { min: 0, max: 1_000_000, minMsg: 'Salary cannot be negative', maxMsg: 'Salary looks too high' }),
}).catchall(numberField);
