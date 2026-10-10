import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restio — Gestão de restaurantes",
  description: "Gestão de restaurantes: salão, cozinha, caixa e financeiro.",
  icons: {
    icon: "/favicon.svg?v=restio-1",
    shortcut: "/favicon.svg?v=restio-1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
