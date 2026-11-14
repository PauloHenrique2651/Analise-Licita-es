import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Nexo Público", template: "%s · Nexo Público" },
  description: "Inteligência de mercado para compras e licitações públicas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={instrumentSans.variable}>
      <body>{children}</body>
    </html>
  );
}
