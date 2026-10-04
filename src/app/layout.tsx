import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CV Generator",
  description: "Evidence-grounded CV generation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
