/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";

import "./globals.css";
import { ReduxProvider } from "../store/ReduxProvider";

export const metadata: Metadata = {
  title: "ClauseAi — Bitcoin-Enforced Smart Contracts",
  description:
    "Turn plain English agreements into Bitcoin-enforced smart contracts in 60 seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon-new.png" type="image/png" />
      </head>
      <body suppressHydrationWarning>
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}
