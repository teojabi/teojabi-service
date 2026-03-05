import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Map, Image as ImageIcon, Search } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-muted/40 items-center flex justify-center">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                터잡이 - 스마트한 부동산 탐색
              </h1>
              <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                지도에서 매물을 검색하고 공시지가, 실거래가, 토지이용계획 등 공공데이터를 한눈에 확인하세요.
              </p>
            </div>
            <div className="space-x-4">
              <Link href="/search">
                <Button size="lg" className="h-11 px-8">지도에서 찾기</Button>
              </Link>
              <Link href="/gallery">
                <Button variant="outline" size="lg" className="h-11 px-8">갤러리 보기</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 items-center flex justify-center">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-3 lg:gap-12">
            <Card>
              <CardHeader className="pb-4 flex flex-row space-y-0 items-center gap-4">
                <Map className="h-8 w-8 text-primary" />
                <div className="space-y-1">
                  <CardTitle>지도 기반 검색</CardTitle>
                  <CardDescription>원하는 지역의 매물을 지도에서 직관적으로 찾아보세요.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                지역, 가격, 면적 등 다양한 조건으로 필터링하여 당신에게 딱 맞는 부동산을 쉽고 빠르게 발견할 수 있습니다.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4 flex flex-row space-y-0 items-center gap-4">
                <Search className="h-8 w-8 text-primary" />
                <div className="space-y-1">
                  <CardTitle>공공데이터 연동</CardTitle>
                  <CardDescription>신뢰할 수 있는 정보를 제공합니다.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                국토교통부 실거래가, 공시지가, 토지이음 데이터를 실시간으로 조회하여 안전하고 정확한 거래를 지원합니다.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4 flex flex-row space-y-0 items-center gap-4">
                <ImageIcon className="h-8 w-8 text-primary" />
                <div className="space-y-1">
                  <CardTitle>시각적 매물 확인</CardTitle>
                  <CardDescription>갤러리로 매물을 한눈에 살펴보세요.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                사진 중심의 직관적인 UI를 제공하여 현장에 가지 않아도 매물의 상태를 생생하게 파악할 수 있도록 돕습니다.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
