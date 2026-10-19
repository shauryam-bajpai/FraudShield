import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
    title: "FraudShield",
    description: "Transaction risk monitoring and analyst review",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}