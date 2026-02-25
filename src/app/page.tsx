import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Whiteboard | Draw Football Plays Online and Challenge a Friend',
  description:
    'Whiteboard is a fast football play drawing board where you design offense and defense, reveal routes, and challenge another player in a shared-device duel.',
  keywords: [
    'football play designer',
    'football playbook creator',
    'draw football plays online',
    'offensive play drawing tool',
    'defensive play drawing tool',
    'football strategy whiteboard',
    '7 on 7 play designer',
    'route tree whiteboard',
    'shared device football game',
    'challenge a friend football plays',
    'coach play drawing app',
    'slytwork whiteboard'
  ],
  alternates: {
    canonical: '/'
  },
  openGraph: {
    title: 'Whiteboard | Draw Football Plays and Challenge Other Players',
    description:
      'Create offense and defense plays in seconds, reveal the action, and challenge others head-to-head on one device.',
    url: '/',
    siteName: 'Whiteboard by Slytwork',
    type: 'website',
    images: [
      {
        url: '/whiteboard-seo-fallback.png',
        width: 1200,
        height: 640,
        alt: 'Whiteboard football play drawing app'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Whiteboard | Draw Football Plays and Challenge a Friend',
    description:
      'Quickly draw football plays, assign routes, and battle head-to-head in a shared-device play design duel.',
    images: ['/whiteboard-seo-fallback.png']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1
    }
  },
  category: 'sports'
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black px-6 py-10 text-center">
      <img
        src="/whiteboard-logo-poweredby.svg"
        alt="Whiteboard by Slytwork"
        className="mb-8 h-auto w-full max-w-[560px] object-contain"
      />

      <p className="max-w-2xl text-sm font-medium leading-relaxed text-zinc-300 sm:text-base">
        Whiteboard helps you quickly draw offense and defense football plays, reveal how they match up, and challenge another
        player in a head-to-head strategy duel.
      </p>

      <Link
        href="/play"
        className="mt-8 inline-flex items-center justify-center rounded-md border border-white bg-white px-8 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-zinc-200"
      >
        Play Now
      </Link>
    </main>
  );
}
