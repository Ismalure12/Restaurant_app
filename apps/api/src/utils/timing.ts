// Step timings for a hot route: sent as a `Server-Timing` header (visible in
// the browser's Network tab) and logged when the whole request is slow.
import type { Response } from 'express';

const SLOW_MS = 300;

export function stopwatch(route: string) {
  const start = performance.now();
  let last = start;
  const steps: [string, number][] = [];
  return {
    /** Ends the current step (time since the previous mark). */
    mark(step: string) {
      const now = performance.now();
      steps.push([step, now - last]);
      last = now;
    },
    /** Sets the header; call right before sending the response. */
    send(res: Response) {
      const total = performance.now() - start;
      const parts = [...steps, ['total', total] as [string, number]];
      if (!res.headersSent) res.set('Server-Timing', parts.map(([n, ms]) => `${n};dur=${ms.toFixed(1)}`).join(', '));
      if (total > SLOW_MS) console.warn(`slow ${route}: ${parts.map(([n, ms]) => `${n}=${ms.toFixed(0)}ms`).join(' ')}`);
    },
  };
}
