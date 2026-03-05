'use client';

import { useState } from 'react';
import { NaverMapWrapper } from '@/components/map/NaverMapWrapper';
import { PropertyCard } from '@/components/property/PropertyCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2 } from 'lucide-react';

export default function SearchPage() {
    const [loading, setLoading] = useState(false);
    const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);

    // Mock markers
    const mockMarkers = [
        { id: 1, lat: 37.498095, lng: 127.027610, title: '강남역 오피스텔', price: '5억' },
        { id: 2, lat: 37.511116, lng: 127.042894, title: '선릉역 아파트', price: '12억' },
        { id: 3, lat: 37.502901, lng: 127.050607, title: '삼성역 상가', price: '25억' },
    ];

    // Mock property details matching markers
    const mockProperties = [
        {
            id: 1,
            title: '강남역 도보 5분 오피스텔',
            address: '서울특별시 서초구 서초대로 397',
            price: '500,000,000원',
            type: '오피스텔',
            area: '전용 35㎡',
            dateAdded: '2023-11-01',
            imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
        },
        {
            id: 2,
            title: '테헤란로 업무지구 아파트',
            address: '서울특별시 강남구 테헤란로 123',
            price: '1,200,000,000원',
            type: '아파트',
            area: '전용 84㎡',
            dateAdded: '2023-11-05',
        },
        {
            id: 3,
            title: '삼성동 코엑스 인근 상가',
            address: '서울특별시 강남구 영동대로 513',
            price: '2,500,000,000원',
            type: '상가',
            area: '전용 120㎡',
            dateAdded: '2023-10-28',
        }
    ];

    const handleMarkerClick = (id: number) => {
        setSelectedPropertyId(id);
        // Ideally map would pan to center
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    const handleBoundsChange = (bounds: any) => {
        // console.log('Bounds changed, fetch new data within limits', bounds);
    };



    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-64px-1px)] w-full overflow-hidden">
            {/* Map Area */}
            <div className="flex-1 relative h-[50vh] md:h-full order-1 md:order-2">
                <div className="absolute top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] z-10 flex shadow-lg rounded-lg bg-background">
                    <Input
                        className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-r-none h-12 text-base"
                        placeholder="동/구/지하철역 이름으로 검색"
                    />
                    <Button size="icon" className="h-12 w-12 rounded-l-none" onClick={() => setLoading(true)}>
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                    </Button>
                </div>

                <NaverMapWrapper
                    markers={mockMarkers}
                    onMarkerClick={handleMarkerClick}
                    onBoundsChange={handleBoundsChange}
                />
            </div>

            {/* Floating List (Sidebar) */}
            <div className="w-full md:w-[400px] h-auto md:h-full bg-background border-t md:border-t-0 md:border-r overflow-y-auto order-2 md:order-1 flex flex-col">
                <div className="p-4 border-b shrink-0 flex justify-between items-center bg-muted/10">
                    <h2 className="font-semibold">현재 지도 내 매물</h2>
                    <span className="text-sm text-primary font-bold">{mockProperties.length}건</span>
                </div>

                <div className="flex-1 p-4 space-y-4 bg-muted/5">
                    {mockProperties.map((property) => (
                        <div
                            key={property.id}
                            className={`transition-all rounded-xl ${selectedPropertyId === property.id ? 'ring-2 ring-primary scale-[1.02] shadow-md bg-background' : 'hover:bg-background/80'}`}
                            onClick={() => setSelectedPropertyId(property.id)}
                        >
                            <PropertyCard
                                {...property}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
