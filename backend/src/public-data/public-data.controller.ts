import { Controller, Get, Query } from '@nestjs/common';
import { PublicDataService } from './public-data.service';

@Controller('api/v1/public-data')
export class PublicDataController {
    constructor(private readonly publicDataService: PublicDataService) { }

    @Get()
    async getPublicData(@Query('address') address: string) {
        if (!address) {
            return { success: false, message: 'Address is required' };
        }
        const data = await this.publicDataService.getPublicData(address);
        return { success: true, data };
    }

    // 키워드(장소명) 검색 → 위경도 좌표 반환
    // GET /api/v1/public-data/search?query=서당초등학교
    @Get('search')
    async searchByKeyword(@Query('query') query: string) {
        if (!query) {
            return { success: false, message: 'query is required' };
        }
        const result = await this.publicDataService.searchByKeyword(query);
        if (!result) {
            return { success: false, message: '검색 결과가 없습니다.' };
        }
        return { success: true, data: result };
    }
}
