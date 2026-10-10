import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comanda Inteligente — Gestão para Restaurantes",
  description: "Gestão de restaurantes: salão, cozinha, caixa e financeiro.",
  icons: {
    icon: "/favicon.svg?v=comanda-2",
    shortcut: "/favicon.svg?v=comanda-2",
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
