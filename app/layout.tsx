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
  title: '在线立直计分｜日本麻将房间记分工具',
  description:
    '免密用户名登录，创建四人房间并在线记录日本立直麻将每局分数、个人战绩与排行榜。',
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
