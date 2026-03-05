'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { MapPin, Calendar, Heart } from 'lucide-react';

export default function MyPage() {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('favorites');

    // Hardcoded mock data for now
    const mockFavorites = [
        { id: 1, address: '서울특별시 강남구 테헤란로 123', price: '1,500,000,000', type: '아파트' },
        { id: 2, address: '경기도 성남시 분당구 판교역로 456', price: '800,000,000', type: '오피스텔' },
    ];

    const mockReservations = [
        { id: 101, address: '서울특별시 서초구 서초대로 789', date: '2023-11-15 14:00', status: 'CONFIRMED' },
        { id: 102, address: '서울특별시 강동구 천호대로 321', date: '2023-11-20 10:30', status: 'PENDING' },
    ];

    const getStatusBadgeVariant = (status: string) => {
        switch (status) {
            case 'CONFIRMED': return 'default';
            case 'PENDING': return 'secondary';
            case 'CANCELLED': return 'destructive';
            default: return 'outline';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'CONFIRMED': return '예약 확정';
            case 'PENDING': return '대기 중';
            case 'CANCELLED': return '취소됨';
            default: return status;
        }
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="mb-8 flex flex-col items-center sm:flex-row sm:items-start gap-6">
                <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground">
                    {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="flex flex-col items-center sm:items-start flex-1 gap-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold">{user?.name || '사용자'} 님</h1>
                        <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200">
                            {user?.role || '일반 회원'}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">{user?.email || 'user@example.com'}</p>
                    <Button variant="outline" size="sm" className="mt-2">프로필 수정</Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="favorites">관심 매물 ({mockFavorites.length})</TabsTrigger>
                    <TabsTrigger value="reservations">상담 예약 내역 ({mockReservations.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="favorites" className="mt-6 space-y-4">
                    {mockFavorites.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Heart className="mx-auto h-12 w-12 mb-4 text-muted" />
                            <p>관심 매물이 없습니다.</p>
                        </div>
                    ) : (
                        mockFavorites.map((item) => (
                            <Card key={item.id} className="overflow-hidden">
                                <div className="flex flex-col sm:flex-row">
                                    <div className="h-48 sm:h-auto sm:w-48 bg-muted flex items-center justify-center relative">
                                        <span className="text-muted-foreground">Image Placeholder</span>
                                        <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-red-500 hover:text-red-600 hover:bg-white/50 bg-white/50 rounded-full">
                                            <Heart className="h-5 w-5 fill-current" />
                                        </Button>
                                    </div>
                                    <CardHeader className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <Badge className="mb-2">{item.type}</Badge>
                                                <CardTitle className="text-xl mb-2">{item.address}</CardTitle>
                                                <CardDescription className="flex items-center gap-1">
                                                    <MapPin className="h-4 w-4" /> 지번 주소 생략
                                                </CardDescription>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-lg">{item.price}원</div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                </div>
                            </Card>
                        ))
                    )}
                </TabsContent>

                <TabsContent value="reservations" className="mt-6 space-y-4">
                    {mockReservations.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Calendar className="mx-auto h-12 w-12 mb-4 text-muted" />
                            <p>예약 내역이 없습니다.</p>
                        </div>
                    ) : (
                        mockReservations.map((item) => (
                            <Card key={item.id}>
                                <CardHeader>
                                    <div className="flex justify-between items-center mb-2">
                                        <Badge variant={getStatusBadgeVariant(item.status)}>
                                            {getStatusLabel(item.status)}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground">예약 번호: #{item.id}</span>
                                    </div>
                                    <CardTitle className="text-lg">{item.address}</CardTitle>
                                    <CardDescription className="flex items-center gap-2 mt-2">
                                        <Calendar className="h-4 w-4" /> {item.date} 상담 예정
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm">문의하기</Button>
                                    {item.status === 'PENDING' && (
                                        <Button variant="destructive" size="sm">예약 취소</Button>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
