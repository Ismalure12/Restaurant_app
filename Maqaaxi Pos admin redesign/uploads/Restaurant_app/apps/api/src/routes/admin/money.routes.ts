// /api/admin — Money: accounts + cash book, collections, staff wallets, day close, month/year statements, customers + invoices, expenses + suppliers.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from '../defineRoute.js';
import { listAccounts, createAccount, setOpeningBalances, recordOwnerMoney, transferMoney, updateAccount, listAccountEntries } from '../../controllers/admin/accounts.controller.js';
import { listCollections, getStaffAccounts, updateStaffAccounts } from '../../controllers/admin/collections.controller.js';
import { listDayCloses, getDayClose, closeBusinessDay, reopenBusinessDay } from '../../controllers/admin/dayClose.controller.js';
import { listMonthStatements, getMonthStatement, closeMonthStatement, reopenMonthStatement, listYearStatements, getYearStatement, closeYearStatement, reopenYearStatement, exportYearStatement } from '../../controllers/admin/statements.controller.js';
import { listCustomers, createCustomer, getCustomer, updateCustomer, getCustomerStatement } from '../../controllers/admin/customers.controller.js';
import { listInvoices, getInvoice, updateInvoice, recordInvoicePayment } from '../../controllers/admin/invoices.controller.js';
import { listExpenses, createExpense, updateExpense, deleteExpense, listExpenseCategories, saveExpenseCategories } from '../../controllers/admin/expenses.controller.js';
import { listSuppliers, createSupplier, getSupplier, updateSupplier, paySupplier } from '../../controllers/admin/suppliers.controller.js';

const router = Router();

defineRoute(router, '/accounts', { GET: listAccounts, POST: createAccount });
defineRoute(router, '/accounts/opening', { PUT: setOpeningBalances });
defineRoute(router, '/accounts/owner', { POST: recordOwnerMoney });
defineRoute(router, '/accounts/transfer', { POST: transferMoney });
defineRoute(router, '/accounts/:id', { PUT: updateAccount });
defineRoute(router, '/accounts/:id/entries', { GET: listAccountEntries });
defineRoute(router, '/collections', { GET: listCollections });
defineRoute(router, '/staff/:id/accounts', { GET: getStaffAccounts, PUT: updateStaffAccounts });
defineRoute(router, '/day-close', { GET: listDayCloses });
defineRoute(router, '/day-close/:day', { GET: getDayClose, POST: closeBusinessDay });
defineRoute(router, '/day-close/:day/reopen', { POST: reopenBusinessDay });
defineRoute(router, '/statements/months', { GET: listMonthStatements });
defineRoute(router, '/statements/month/:month', { GET: getMonthStatement, POST: closeMonthStatement });
defineRoute(router, '/statements/month/:month/reopen', { POST: reopenMonthStatement });
defineRoute(router, '/statements/years', { GET: listYearStatements });
defineRoute(router, '/statements/year/:fy', { GET: getYearStatement, POST: closeYearStatement });
defineRoute(router, '/statements/year/:fy/reopen', { POST: reopenYearStatement });
defineRoute(router, '/statements/year/:fy/export', { GET: exportYearStatement });
defineRoute(router, '/customers', { GET: listCustomers, POST: createCustomer });
defineRoute(router, '/customers/:id', { GET: getCustomer, PATCH: updateCustomer });
defineRoute(router, '/customers/:id/statement', { GET: getCustomerStatement });
defineRoute(router, '/invoices', { GET: listInvoices });
defineRoute(router, '/invoices/:id', { GET: getInvoice, PATCH: updateInvoice });
defineRoute(router, '/invoices/:id/payments', { POST: recordInvoicePayment });
defineRoute(router, '/expenses', { GET: listExpenses, POST: createExpense });
defineRoute(router, '/expenses/:id', { PATCH: updateExpense, DELETE: deleteExpense });
defineRoute(router, '/expense-categories', { GET: listExpenseCategories, PUT: saveExpenseCategories });
defineRoute(router, '/suppliers', { GET: listSuppliers, POST: createSupplier });
defineRoute(router, '/suppliers/:id', { GET: getSupplier, PUT: updateSupplier });
defineRoute(router, '/suppliers/:id/payments', { POST: paySupplier });

export default router;
