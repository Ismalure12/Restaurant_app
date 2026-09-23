// Fail fast at boot: a missing secret must crash the process on deploy,
// not surface as a forgeable token or a broken query in production.
const REQUIRED = ['JWT_SECRET', 'DATABASE_URL'] as const;

for (const name of REQUIRED) {
  if (!process.env[name]) throw new Error(`${name} environment variable is required`);
}

const isProduction = process.env.NODE_ENV === 'production';

// Payments: in production a missing credential must stop the deploy, not
// surface as a broken checkout for the first customer.
if (isProduction) {
  for (const name of ['SIFALO_API_USER', 'SIFALO_API_KEY', 'PUBLIC_APP_URL'] as const) {
    if (!process.env[name]) throw new Error(`${name} environment variable is required in production`);
  }
}

// The restaurant's timezone: receipt numbers reset at local midnight and every
// report "day" is a local day. A typo must fail at boot, not shift every report.
const businessTz = (process.env.BUSINESS_TZ || 'Africa/Mogadishu').trim();
try {
  new Intl.DateTimeFormat('en-CA', { timeZone: businessTz });
} catch {
  throw new Error(`BUSINESS_TZ must be an IANA timezone like "Africa/Mogadishu" (got "${process.env.BUSINESS_TZ}")`);
}

export const env = {
  JWT_SECRET: process.env.JWT_SECRET as string,
  DATABASE_URL: process.env.DATABASE_URL as string,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  isProduction,
  SIFALO_API_USER: process.env.SIFALO_API_USER ?? '',
  SIFALO_API_KEY: process.env.SIFALO_API_KEY ?? '',
  // Public origin customers browse on — Sifalo sends them back to
  // `${PUBLIC_APP_URL}/api/payment/return`. Dev default = the Next dev port.
  PUBLIC_APP_URL: (process.env.PUBLIC_APP_URL || 'http://localhost:3100').replace(/\/+$/, ''),
  BUSINESS_TZ: businessTz,
};
