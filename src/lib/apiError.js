/**
 * Wrap fetch + JSON parse + non-2xx → Error so React Query / mutation
 * `onError` handlers see structured messages.
 */
export async function fetchJson(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    const err = new Error('Network error');
    err.status = 0;
    throw err;
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!res.ok) {
    const err = new Error(
      (data && (data.error || data.message)) || `Request failed (${res.status})`
    );
    err.status = res.status;
    err.details = data?.details ?? null;
    throw err;
  }

  return data;
}

export function parseApiError(err) {
  if (!err) return 'Something went wrong';
  if (typeof err === 'string') return err;
  return err.message || 'Something went wrong';
}
