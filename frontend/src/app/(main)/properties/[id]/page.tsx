'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Box, Calendar, ChevronLeft, ChevronRight, Share2, Heart, Info, DollarSign } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from '@/components/ui/sheet';


export default function PropertyDetailPage() {
    const params = useParams();
    const id = params.id;
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Mock property data
    const property = {
        id,
        title: '강남역 도보 5분 신축 오피스텔',
        address: '서울특별시 서초구 서초대로 397',
        price: '500,000,000',
        type: '오피스텔',
        area: '전용 35㎡ (약 10.5평)',
        dateAdded: '2023-11-01',
        description: '강남역 초역세권 신축 오피스텔입니다. 풀옵션, 남향으로 채광이 우수합니다. 주차 1대 무료 가능하며, 즉시 입주 가능합니다. 주변 편의시설이 잘 갖춰져 있어 생활하기 매우 편리합니다.',
        images: [
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
        ],
        features: ['풀옵션', '남향', '주차가능', '엘리베이터', 'CCTV', '무인택배함'],
        publicData: {
            actualPrice: { latest: '480,000,000', date: '2023.09' },
            officialLandPrice: '8,500,000/㎡',
        }
    };

    const nextImage = () => {
        setCurrentImageIndex((prev) => (prev + 1) % property.images.length);
    };

    const prevImage = () => {
        setCurrentImageIndex((prev) => (prev - 1 + property.images.length) % property.images.length);
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-primary">{property.type}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center">
                            <Calendar className="h-3.5 w-3.5 mr-1" /> {property.dateAdded} 확인
                        </span>
                    </div>
                    <h1 className="text-3xl font-bold">{property.title}</h1>
                    <p className="text-muted-foreground flex items-center mt-2">
                        <MapPin className="h-4 w-4 mr-1" /> {property.address}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon">
                        <Share2 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                        <Heart className="h-4 w-4" />
                    </Button>
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button size="lg" className="ml-2">상담 예약하기</Button>
                        </SheetTrigger>
                        <SheetContent>
                            <SheetHeader>
                                <SheetTitle>상담 예약</SheetTitle>
                                <SheetDescription>
                                    이 매물에 대해 궁금한 점이 있으신가요?
                                    연락처를 남겨주시면 담당 컨설턴트가 빠르게 연락드리겠습니다.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <label htmlFor="name" className="text-sm font-medium">이름</label>
                                    <Input id="name" placeholder="홍길동" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="phone" className="text-sm font-medium">연락처</label>
                                    <Input id="phone" placeholder="010-1234-5678" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="date" className="text-sm font-medium">희망 상담일시</label>
                                    <Input id="date" type="datetime-local" />
                                </div>
                            </div>
                            <SheetFooter>
                                <SheetClose asChild>
                                    <Button type="submit" className="w-full">예약 신청 완료</Button>
                                </SheetClose>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {/* Image Gallery */}
            <div className="relative aspect-video max-h-[500px] w-full bg-muted rounded-xl overflow-hidden mb-8 group">
                <img
                    src={property.images[currentImageIndex]}
                    alt={`${property.title} - 사진 ${currentImageIndex + 1}`}
                    className="w-full h-full object-cover transition-opacity duration-300"
                />

                <div className="absolute inset-0 flex items-center justify-between p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="secondary" size="icon" className="rounded-full shadow-md" onClick={prevImage}>
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button variant="secondary" size="icon" className="rounded-full shadow-md" onClick={nextImage}>
                        <ChevronRight className="h-6 w-6" />
                    </Button>
                </div>

                <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
                    {currentImageIndex + 1} / {property.images.length}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content (Left) */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Summary Box */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-card rounded-xl border shadow-sm">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">매매가</p>
                            <p className="text-xl font-bold text-primary">{property.price}원</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">면적</p>
                            <p className="font-semibold flex items-center"><Box className="h-4 w-4 mr-1" /> {property.area}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">매물유형</p>
                            <p className="font-semibold">{property.type}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">매물번호</p>
                            <p className="font-semibold">{property.id}</p>
                        </div>
                    </div>

                    {/* Description */}
                    <section>
                        <h2 className="text-2xl font-bold mb-4">매물 소개</h2>
                        <div className="prose max-w-none">
                            <p className="whitespace-pre-line leading-relaxed text-lg">
                                {property.description}
                            </p>
                        </div>
                    </section>

                    {/* Features */}
                    <section>
                        <h2 className="text-2xl font-bold mb-4">옵션 및 특징</h2>
                        <div className="flex flex-wrap gap-2">
                            {property.features.map((feature, idx) => (
                                <Badge key={idx} variant="secondary" className="px-3 py-1.5 text-sm">
                                    {feature}
                                </Badge>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Sidebar (Right) - Public Data */}
                <div className="space-y-6">
                    <Card className="border-primary/20 shadow-md">
                        <CardHeader className="bg-primary/5 pb-4">
                            <CardTitle className="flex items-center text-lg">
                                <Info className="h-5 w-5 mr-2 text-primary" />
                                공공데이터 정보
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">

                            <div>
                                <h4 className="font-semibold flex items-center mb-3">
                                    <DollarSign className="h-4 w-4 mr-1 text-muted-foreground" />
                                    최근 실거래가
                                </h4>
                                <div className="bg-muted p-4 rounded-lg flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">{property.publicData.actualPrice.date} 기준</span>
                                    <span className="font-bold text-lg">{property.publicData.actualPrice.latest}원</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2 px-1">
                                    * 국토교통부 실거래가 공개시스템 기준
                                </p>
                            </div>

                            <div className="border-t pt-4">
                                <h4 className="font-semibold flex items-center mb-3">
                                    <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                                    공시지가
                                </h4>
                                <div className="bg-muted p-4 rounded-lg flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">단위면적(㎡)당</span>
                                    <span className="font-bold text-lg">{property.publicData.officialLandPrice}원</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2 px-1">
                                    * 부동산공시가격알리미 기준
                                </p>
                            </div>

                            <Button variant="outline" className="w-full mt-2">
                                토지이음 상세 계획 보기
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
