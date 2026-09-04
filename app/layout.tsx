import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uniser SmartSpaces — Demo",
  description:
    "Interactive demonstration of Uniser lighting, automation and energy systems for commercial and residential spaces.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The demo is a fixed-layout instrument, not a document. Pinch-zooming it
  // mid-pitch only ever happens by accident.
  maximumScale: 1,
  themeColor: "#0a0b0e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full bg-shell-950 text-shell-200 antialiased">
        {children}
      </body>
    </html>
  );
}
