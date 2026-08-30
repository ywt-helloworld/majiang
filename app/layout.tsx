import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '立直计分｜日本麻将计分工具',
  description: '适配手机屏幕的日本立直麻将计分板，快速记录荣和、自摸、流局与点数修正。',
  openGraph: {
    title: '立直计分｜日本麻将计分工具',
    description: '手机端日本立直麻将计分与赛事 pt 结算工具',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '立直计分' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '立直计分｜日本麻将计分工具',
    description: '手机端日本立直麻将计分与赛事 pt 结算工具',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
