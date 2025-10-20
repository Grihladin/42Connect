"use client";

import "./globals.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-6 py-16">
          {children}
        </main>
      </body>
    </html>
  );
}
