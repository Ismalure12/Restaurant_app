import 'dotenv/config';

const BASE = 'http://localhost:3000';
let cookie = '';

function j(res) { return res.text().then((t) => { try { return JSON.parse(t); } catch { return { raw: t }; } }); }

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) },
  });
  const body = await j(res);
  return { status: res.status, body, res };
}

const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);

async function main() {
  // 1. login
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  const setCookie = login.headers.get('set-cookie');
  cookie = setCookie ? setCookie.split(';')[0] : '';
  ok('login', login.status === 200 && !!cookie, `status ${login.status}`);
  if (!cookie) return;

  // 2. menu item to order
  const items = await call('/api/menu-items');
  const item = items.body[0];
  ok('menu items load', items.status === 200 && !!item, `${items.body.length} items`);

  // 2b. create a waiter (non-login record)
  const waiter = await call('/api/admin/waiters', { method: 'POST', body: JSON.stringify({ name: `E2E Ali ${Date.now()}`, phone: '252610000099' }) });
  ok('waiter created', waiter.status === 201, `status ${waiter.status}`);
  const waiterId = waiter.body.id;

  // 3. POS order (dine-in with table + waiter) — created already PAID, no payment step
  const unitPrice = Number(item.price);
  const order = await call('/api/admin/pos/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ itemId: item.id, name: item.name, imageUrl: item.imageUrl, optionName: null, extras: [], notes: 'e2e', unitPrice, quantity: 2 }],
      orderType: 'dine_in', tableNumber: '7', waiterId,
    }),
  });
  const expectedTotal = unitPrice * 2;
  ok('POS order created', order.status === 201, `status ${order.status} total ${order.body.total}`);
  ok('POS total correct', Number(order.body.total) === expectedTotal, `${order.body.total} vs ${expectedTotal}`);
  ok('POS order auto-paid', order.body.paymentStatus === 'paid', `status ${order.body.paymentStatus}`);
  const orderId = order.body.id;

  // 5. fetch order, verify shape
  const fetched = await call(`/api/admin/orders/${orderId}`);
  ok('order source=pos', fetched.body.source === 'pos');
  ok('order customer null', fetched.body.customer === null);
  ok('order dine_in + table', fetched.body.orderType === 'dine_in' && fetched.body.tableNumber === '7');
  ok('order paymentStatus paid', fetched.body.paymentStatus === 'paid');
  ok('order has staff', !!fetched.body.staff, `${fetched.body.staff}`);
  ok('order has waiter', !!fetched.body.waiter && fetched.body.waiter === waiter.body.name, `${fetched.body.waiter}`);

  // 3b. takeaway: no table, no delivery → inferred takeaway
  const takeaway = await call('/api/admin/pos/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [{ itemId: item.id, name: item.name, unitPrice, quantity: 1, extras: [] }], orderType: 'takeaway' }),
  });
  ok('takeaway created', takeaway.status === 201, `status ${takeaway.status}`);
  const takeFetched = await call(`/api/admin/orders/${takeaway.body.id}`);
  ok('takeaway has no table', takeFetched.body.orderType === 'takeaway' && !takeFetched.body.tableNumber);

  // 5b. delivery order with 10% discount + delivery fee
  const delPrice = Number(item.price);
  const fee = 3;
  const delOrder = await call('/api/admin/pos/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ itemId: item.id, name: item.name, unitPrice: delPrice, quantity: 1, extras: [] }],
      orderType: 'delivery', discountType: 'percent', discountValue: 10, deliveryFee: fee,
      contactName: 'E2E Cust', contactPhone: '252610000000', address: '12 Test Street',
    }),
  });
  const expDelTotal = Math.round((delPrice * 0.9 + fee) * 100) / 100;
  ok('delivery+discount created', delOrder.status === 201, `status ${delOrder.status}`);
  ok('delivery discount = 10%', Number(delOrder.body.discount) === Math.round(delPrice * 10) / 100, `disc ${delOrder.body.discount}`);
  ok('delivery total = sub*0.9+fee', Number(delOrder.body.total) === expDelTotal, `${delOrder.body.total} vs ${expDelTotal}`);
  const delFetched = await call(`/api/admin/orders/${delOrder.body.id}`);
  ok('delivery contact stored', delFetched.body.contactPhone === '252610000000' && delFetched.body.address === '12 Test Street');
  ok('delivery fee stored', Number(delFetched.body.deliveryFee) === fee, `fee ${delFetched.body.deliveryFee}`);

  // 5c. fixed discount is clamped to subtotal
  const clampOrder = await call('/api/admin/pos/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ itemId: item.id, name: item.name, unitPrice: delPrice, quantity: 1, extras: [] }],
      orderType: 'delivery', discountType: 'fixed', discountValue: 99999, deliveryFee: fee,
      contactName: 'E2E', contactPhone: '252610000001', address: 'Clamp St',
    }),
  });
  ok('fixed discount clamped to subtotal', Number(clampOrder.body.discount) === delPrice, `disc ${clampOrder.body.discount}`);
  ok('clamped total = fee only', Number(clampOrder.body.total) === fee, `total ${clampOrder.body.total}`);

  // 5d. delivery without phone/address rejected
  const badDel = await call('/api/admin/pos/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [{ itemId: item.id, name: item.name, unitPrice: delPrice, quantity: 1, extras: [] }], orderType: 'delivery' }),
  });
  ok('delivery missing contact rejected', badDel.status === 400, `status ${badDel.status}`);

  // 6. inventory
  const inv = await call('/api/admin/inventory', {
    method: 'POST', body: JSON.stringify({ name: `E2E Flour ${Date.now()}`, unit: 'kg', reorderLevel: 4, costPerUnit: 2 }),
  });
  ok('inventory item created', inv.status === 201, `status ${inv.status}`);
  const invId = inv.body.id;

  const mv1 = await call(`/api/admin/inventory/${invId}/movements`, {
    method: 'POST', body: JSON.stringify({ type: 'purchase', quantity: 5, unitCost: 2, note: 'e2e purchase' }),
  });
  ok('purchase movement', mv1.status === 201 && Number(mv1.body.quantity) === 5, `qty ${mv1.body.quantity}`);

  const mv2 = await call(`/api/admin/inventory/${invId}/movements`, {
    method: 'POST', body: JSON.stringify({ type: 'usage', quantity: 2 }),
  });
  ok('usage movement decrements', Number(mv2.body.quantity) === 3, `qty ${mv2.body.quantity}`);

  const invList = await call('/api/admin/inventory');
  const invRow = invList.body.find((i) => i.id === invId);
  ok('low-stock flag set', invRow.lowStock === true, `qty ${invRow.quantity} reorder ${invRow.reorderLevel}`);

  // 7. finance summary
  const fin = await call('/api/admin/finance/summary');
  ok('finance revenue includes paid order', fin.body.revenueTotal >= expectedTotal, `rev ${fin.body.revenueTotal}`);
  ok('finance expenses include purchase', fin.body.expensesTotal >= 10, `exp ${fin.body.expensesTotal}`);
  ok('finance has sales-by-staff', Array.isArray(fin.body.salesByStaff) && fin.body.salesByStaff.length > 0);

  // 8. shifts
  // close any pre-existing open shift first to get a clean state
  await call('/api/admin/shifts/clock-out', { method: 'POST', body: '{}' });
  const ci = await call('/api/admin/shifts/clock-in', { method: 'POST', body: JSON.stringify({ openingFloat: 50 }) });
  ok('clock-in', ci.status === 201, `status ${ci.status}`);
  const ciDup = await call('/api/admin/shifts/clock-in', { method: 'POST', body: '{}' });
  ok('double clock-in rejected', ciDup.status === 409, `status ${ciDup.status}`);
  const co = await call('/api/admin/shifts/clock-out', { method: 'POST', body: JSON.stringify({ closingCash: 120 }) });
  ok('clock-out', co.status === 200, `status ${co.status}`);

  // 9. order channel split
  const posList = await call('/api/admin/orders?source=pos');
  ok('source=pos returns only pos', posList.status === 200 && posList.body.every((o) => o.source === 'pos'), `${posList.body.length} pos`);
  ok('counter order shows waiter', posList.body.some((o) => o.id === orderId && o.waiter === waiter.body.name));
  const onlineList = await call('/api/admin/orders?source=online');
  ok('source=online excludes pos', onlineList.body.every((o) => o.source === 'online'), `${onlineList.body.length} online`);

  // 10. reports summary
  const rep = await call('/api/admin/reports/summary');
  ok('reports manual count ≥ 1', rep.body.ordersBySource?.pos?.count >= 1, `pos ${rep.body.ordersBySource?.pos?.count}`);
  ok('reports items sold > 0', rep.body.itemsSoldUnits > 0, `units ${rep.body.itemsSoldUnits}`);
  ok('reports waiter performance', Array.isArray(rep.body.waiterPerformance) && rep.body.waiterPerformance.some((w) => w.waiterId === waiterId));

  // 11. cashier role checks (cashier may read waiters, not create them or see reports)
  if (process.env.CASHIER_EMAIL) {
    const cLogin = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.CASHIER_EMAIL, password: process.env.CASHIER_PASSWORD }) });
    const cCookie = cLogin.headers.get('set-cookie')?.split(';')[0] || '';
    const cGet = await fetch(BASE + '/api/admin/waiters?active=1', { headers: { Cookie: cCookie } });
    ok('cashier can read waiters', cGet.status === 200, `status ${cGet.status}`);
    const cPost = await fetch(BASE + '/api/admin/waiters', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cCookie }, body: JSON.stringify({ name: 'nope' }) });
    ok('cashier cannot create waiter', cPost.status === 403, `status ${cPost.status}`);
    const cRep = await fetch(BASE + '/api/admin/reports/summary', { headers: { Cookie: cCookie } });
    ok('cashier cannot see reports', cRep.status === 403, `status ${cRep.status}`);
  }

  // cleanup
  await call(`/api/admin/inventory/${invId}`, { method: 'DELETE' });
  await call(`/api/admin/waiters/${waiterId}`, { method: 'DELETE' }); // may 409 if order references it — that's fine
  console.log('\nDone.');
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
