import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The Sifalo client itself, against a stubbed fetch (always the live hosts).
const { startCheckout, verify, refund, gatewayForPaymentType, chargedAmount, FIXED_CHARGE_USD } = await import('../src/lib/payments/sifalo.js');

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200) => ({ status, json: async () => body });

describe('startCheckout', () => {
  it('POSTs to the live gateway with Basic auth and builds the live checkout URL', async () => {
    fetchMock.mockResolvedValue(reply({ key: 'K+1', token: 'T/2' }));
    const r = await startCheckout({ amount: '14.50', returnUrl: 'https://x.test/api/payment/return?order_id=o1' });
    expect(r).toEqual({ ok: true, checkoutUrl: 'https://pay.sifalo.com/checkout/?key=K%2B1&token=T%2F2' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sifalopay.com/gateway/');
    expect(JSON.parse(init.body)).toEqual({ amount: '14.50', gateway: 'checkout', currency: 'USD', return_url: 'https://x.test/api/payment/return?order_id=o1' });
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('test-user:test-key').toString('base64')}`);
  });

  it('code 0 (bad credentials) → not ok', async () => {
    fetchMock.mockResolvedValue(reply({ code: 0, response: null }));
    const r = await startCheckout({ amount: '1.00', returnUrl: 'https://x.test/r' });
    expect(r.ok).toBe(false);
  });

  it('network failure → not ok (no throw)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    expect((await startCheckout({ amount: '1.00', returnUrl: 'https://x.test/r' })).ok).toBe(false);
  });
});

describe('verify', () => {
  it('paid only for status success AND code 601; verify is unauthenticated', async () => {
    fetchMock.mockResolvedValue(reply({ sid: 'S', amount: '1', currency: 'USD', payment_type: 'EDAHAB', status: 'success', code: 601 }));
    const v = await verify({ sid: 'S' });
    expect(v).toMatchObject({ state: 'paid', sid: 'S', amount: '1', paymentType: 'EDAHAB', code: '601' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sifalopay.com/gateway/verify.php');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it.each([
    [{ status: 'success', code: 600 }, 'failed'],
    [{ status: 'pending', code: 603 }, 'pending'],
    [{ status: 'failed', code: 604 }, 'failed'],
    [{ status: 'failed', code: 600, response: 'order_id not found' }, 'failed'],
  ])('%o → %s', async (body, state) => {
    fetchMock.mockResolvedValue(reply(body));
    expect((await verify({ order_id: 'o' })).state).toBe(state);
  });

  it('transport failure → pending + unreachable, never failed', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    expect(await verify({ sid: 'S' })).toMatchObject({ state: 'pending', unreachable: true });
  });
});

describe('refund', () => {
  it('sends payment_type refund with the original sid/gateway; 601 → ok', async () => {
    fetchMock.mockResolvedValue(reply({ code: '601', sid: 'R1' }));
    const r = await refund({ sid: 'S', gateway: 'waafi', amount: '5.00', orderId: 'o-R' });
    expect(r).toEqual({ ok: true, refundSid: 'R1' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ payment_type: 'refund', sid: 'S', gateway: 'waafi', amount: '5.00', currency: 'USD', order_id: 'o-R' });
  });

  it('anything but 601 → not ok with the gateway message', async () => {
    fetchMock.mockResolvedValue(reply({ code: '404', response: 'sid is required for refund.' }));
    expect(await refund({ sid: '', gateway: 'waafi', amount: '5.00', orderId: 'o' })).toEqual({ ok: false, error: 'sid is required for refund.', code: '404' });
  });
});

it('maps Sifalo payment types to refund gateways', () => {
  expect(gatewayForPaymentType('ZAAD')).toBe('waafi');
  expect(gatewayForPaymentType('EDAHAB')).toBe('edahab');
  expect(gatewayForPaymentType('PREMIER WALLET')).toBe('pbwallet');
  expect(gatewayForPaymentType('CARD')).toBe('card');
  expect(gatewayForPaymentType(null)).toBe('sifalo');
});

it('chargedAmount: the test charge while FIXED_CHARGE_USD is set, else the real total', () => {
  // While testing, every order is charged the fixed amount whatever its total.
  if (FIXED_CHARGE_USD) {
    expect(chargedAmount('14.50')).toBe(FIXED_CHARGE_USD);
    expect(chargedAmount(3)).toBe(FIXED_CHARGE_USD);
  } else {
    expect(chargedAmount('14.5')).toBe('14.50');
  }
});
