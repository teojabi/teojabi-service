import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, SlidersHorizontal } from 'lucide-react';

export function FilterBar() {
    return (
        <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-card p-4 rounded-lg border shadow-sm items-center">
            <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="지역명, 지하철역, 학교명 등으로 검색"
                    className="pl-9 bg-background w-full"
                />
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" className="flex-1 sm:flex-none">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    유형/가격 필터
                </Button>
                <Button className="flex-1 sm:flex-none">검색</Button>
            </div>
        </div>
    );
}
