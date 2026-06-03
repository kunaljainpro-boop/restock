import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://restock.app"),
  title: {
    default: "ReStock",
    template: "%s | ReStock",
  },
  description: "The Modern FMCG Reorder List",
  applicationName: "ReStock",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ReStock",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "ReStock",
    description: "The Modern FMCG Reorder List",
    siteName: "ReStock",
    images: [{ url: "/restockname.png", width: 1920, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ReStock",
    description: "The Modern FMCG Reorder List",
    images: ["/restockname.png"],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
