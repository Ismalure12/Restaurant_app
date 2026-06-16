import { Cormorant_Garamond, Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
});

// Geist (variable woff) powers the admin "Ledger" theme only — referenced via
// --font-geist / --font-geist-mono inside .adm-shell, so the public site is untouched.
const geist = localFont({
  src: './fonts/GeistVF.woff',
  weight: '100 900',
  variable: '--font-geist',
  display: 'swap',
});

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Hotel Jazeera — Menu',
  description: 'Hotel Jazeera — dining menu. Browse, customise and order from your table.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${cormorant.variable} ${inter.variable} ${geist.variable} ${geistMono.variable}`}
        style={{ fontFamily: 'var(--font-inter), system-ui, -apple-system, sans-serif', margin: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
