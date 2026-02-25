import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whiteboard.slytwork.com'),
  title: 'Whiteboard by Slytwork.com',
  description: 'Shared-device pass-and-play football strategy game.',
  icons: {
    icon: [{ url: '/favicon-v2.png', type: 'image/png' }],
    shortcut: '/favicon-v2.png',
    apple: '/favicon-v2.png'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
