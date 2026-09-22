import { env } from './config/env.js';
import { createApp } from './app.js';
import { FIXED_CHARGE_USD } from './lib/payments/sifalo.js';
import prisma from './lib/db/prisma.js';
import { startReconciler, stopReconciler } from './lib/payments/paymentReconciler.js';
import { closeAll as closeEventStreams, heartbeat } from './lib/orders/orderEvents.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Maqaaxi Pos API listening on :${env.PORT} (${env.NODE_ENV})`);
  if (FIXED_CHARGE_USD) console.warn(`Sifalo TEST CHARGE active: every online checkout is charged $${FIXED_CHARGE_USD} (FIXED_CHARGE_USD in src/lib/payments/sifalo.ts)`);
  // Confirms online payments whose customer never came back from Sifalo.
  // On in production; a development machine (often pointed at the real
  // database) must never change payment data in the background, so it is off
  // there unless PAYMENT_RECONCILER=on. PAYMENT_RECONCILER=off disables it anywhere.
  const reconcile = process.env.PAYMENT_RECONCILER ?? (env.isProduction ? 'on' : 'off');
  if (reconcile === 'on') startReconciler();
  else console.log('Payment reconciler is off (PAYMENT_RECONCILER=on to enable)');
});

// SSE: a comment every 25 s keeps idle admin streams open through proxies.
const sseHeartbeat = setInterval(heartbeat, 25_000);
sseHeartbeat.unref();

// payment/initiate waits up to 270s on Waafi (it had maxDuration = 300 on
// Vercel) — the server must not cut the request before that.
server.requestTimeout = 310_000;
server.headersTimeout = 315_000;
server.keepAliveTimeout = 65_000;

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — draining connections`);
  stopReconciler();
  clearInterval(sseHeartbeat);
  // Open SSE streams would hold server.close() until the hard stop.
  closeEventStreams();
  // Stop accepting, let in-flight requests (payments) finish, then release the pool.
  server.close(async (err) => {
    await prisma.$disconnect().catch((e) => console.error('prisma disconnect failed:', e));
    process.exit(err ? 1 : 0);
  });
  // Hard stop just past the longest legitimate request.
  setTimeout(() => process.exit(1), 320_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
