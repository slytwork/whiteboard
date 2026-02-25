import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://whiteboard.slytwork.com",
  ),
  title: "Whiteboard by Slytwork.com",
  description: "Shared-device pass-and-play football strategy game.",
  openGraph: {
    images: [
      {
        url: "/whiteboard-seo-fallback.png",
        width: 1200,
        height: 630,
        alt: "Whiteboard by Slytwork",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/whiteboard-seo-fallback.png"],
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: "/favicon@2x.png",
    apple: "/favicon@3x.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
