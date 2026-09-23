import { Cormorant_Garamond, Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';

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

// Admin numbers (docs/admin-design-system.md §2).
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata = {
  title: 'Maqaaxi Pos — Menu',
  description: 'Maqaaxi Pos — restaurant menu. Browse, customise and order from your table.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${cormorant.variable} ${inter.variable} ${jetbrains.variable}`}
        style={{ fontFamily: 'var(--font-inter), system-ui, -apple-system, sans-serif', margin: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
