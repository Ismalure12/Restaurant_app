import { Fraunces, Instrument_Sans } from 'next/font/google';
import localFont from 'next/font/local';
import '@/styles/globals.css';

// Display face — the restaurant's voice. Variable optical size so headings
// tighten as they grow.
const fraunces = Fraunces({
  subsets: ['latin'],
  // Variable font: `axes` and an explicit weight list are mutually exclusive,
  // so the whole 100-900 range ships and `opsz` tracks the rendered size.
  axes: ['SOFT', 'WONK', 'opsz'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

// UI face — carries every dense table, form and figure in the admin.
const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-instrument',
  display: 'swap',
});

// Kept for tabular figures (money, order codes, receipt numbers). The 80mm
// receipt loads its own self-hosted face in receiptCss.js and is unaffected.
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Maqaaxi Pos — Menu',
  description: 'Maqaaxi Pos — restaurant menu. Browse, customise and order from your table.',
};

// Applies the stored theme before first paint. Without this the admin renders
// one light frame before React reads localStorage, which reads as a flash.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('mx_theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${fraunces.variable} ${instrument.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body style={{ fontFamily: 'var(--font-ui)', margin: 0 }}>
        <main>{children}</main>
      </body>
    </html>
  );
}
