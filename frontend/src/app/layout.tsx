import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/common/Header';
import { Footer } from '@/components/common/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '터잡이 - 부동산 매물 검색 플랫폼',
  description: '터잡이에서 다양한 부동산 매물을 확인하고 실거래가, 공시지가를 비교해보세요.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
