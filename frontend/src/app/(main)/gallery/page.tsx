import { PropertyCard } from '@/components/property/PropertyCard';
import { FilterBar } from '@/components/property/FilterBar';

export default function GalleryPage() {
    // Mock data for the gallery
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
            title: '판교 테크노밸리 인근 신축 아파트',
            address: '경기도 성남시 분당구 대왕판교로 645',
            price: '1,200,000,000원',
            type: '아파트',
            area: '전용 84㎡',
            dateAdded: '2023-11-05',
            imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
        },
        {
            id: 3,
            title: '홍대입구역 역세권 상가',
            address: '서울특별시 마포구 양화로 156',
            price: '2,500,000,000원',
            type: '상가',
            area: '전용 120㎡',
            dateAdded: '2023-10-28',
            imageUrl: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
        },
        {
            id: 4,
            title: '제주도 애월 오션뷰 전원주택',
            address: '제주특별자치도 제주시 애월읍 애월해안로',
            price: '850,000,000원',
            type: '전원주택',
            area: '대지 300㎡ / 연면적 150㎡',
            dateAdded: '2023-11-10',
            imageUrl: 'https://images.unsplash.com/photo-1449844908441-8829872d2607?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
        },
    ];

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">매물 갤러리</h1>
                <p className="text-muted-foreground">다양한 조건의 매물을 사진과 함께 한눈에 확인하세요.</p>
            </div>

            <FilterBar />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {mockProperties.map((property) => (
                    <PropertyCard
                        key={property.id}
                        {...property}
                    />
                ))}
            </div>
        </div>
    );
}
