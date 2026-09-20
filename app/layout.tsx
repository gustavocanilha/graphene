/* eslint-disable @next/next/no-page-custom-font -- App Router: o link no layout raiz vale para todas as páginas. */
import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = { title: "Graphene — construtor de grafos de agentes", description: "Desenhe loops Trabalhador-Supervisor e exporte para LangGraph." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
