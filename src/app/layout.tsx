import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Whiteboard by Slytwork.com',
  description: 'Shared-device pass-and-play football strategy game.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
