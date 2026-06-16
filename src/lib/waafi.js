const WAAFI_ENDPOINT = 'https://api.waafipay.com/asm';

function buildBaseRequest(serviceName, serviceParams) {
  return {
    schemaVersion: '1.0',
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    channelName: 'WEB',
    serviceName,
    serviceParams: {
      merchantUid: process.env.WAAFI_MERCHANT_UID,
      apiUserId: process.env.WAAFI_API_USER_ID,
      apiKey: process.env.WAAFI_API_KEY,
      ...serviceParams,
    },
  };
}

async function callWaafi(body) {
  let raw;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 270_000);
    let res;
    try {
      res = await fetch(WAAFI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    raw = await res.json();
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    return { ok: false, networkError: true, message: isTimeout ? 'waafi timeout' : (err?.message || 'network error'), raw: null };
  }

  const responseCode = raw?.responseCode;
  const state = raw?.params?.state;
  const transactionId = raw?.params?.transactionId;
  const ok = responseCode === '2001' && (state === 'APPROVED' || state === 'approved');
  const message = raw?.responseMsg || raw?.params?.description || raw?.errorCode || null;

  return { ok, responseCode, state, transactionId, message, raw };
}

export async function waafiPreAuthorize({ accountNo, referenceId, amount, description }) {
  const body = buildBaseRequest('API_PREAUTHORIZE', {
    paymentMethod: 'MWALLET_ACCOUNT',
    payerInfo: { accountNo },
    transactionInfo: {
      referenceId,
      amount,
      currency: 'USD',
      description: description || 'KFG Order',
    },
  });
  return callWaafi(body);
}

export async function waafiCommit({ transactionId, description }) {
  const body = buildBaseRequest('API_PREAUTHORIZE_COMMIT', {
    transactionId,
    description: description || 'Order accepted',
  });
  return callWaafi(body);
}

export async function waafiCancel({ transactionId, description }) {
  const body = buildBaseRequest('API_PREAUTHORIZE_CANCEL', {
    transactionId,
    description: description || 'Order declined',
  });
  return callWaafi(body);
}
