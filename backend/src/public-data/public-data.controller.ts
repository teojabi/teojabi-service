import { Controller, Get, Query } from '@nestjs/common';
import { PublicDataService } from './public-data.service';

@Controller('api/v1/public-data')
export class PublicDataController {
  constructor(private readonly publicDataService: PublicDataService) {}

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
    return { success: true, data: result };
  }

  // PNU 기반 건물/토지/층별현황/상가 정보 조회
  // GET /api/v1/public-data/location-info?pnu=1168010100106180000
  @Get('location-info')
  async getLocationInfo(@Query('pnu') pnu: string) {
    if (!pnu) {
      return { success: false, message: 'pnu is required' };
    }
    const result = await this.publicDataService.getLocationInfo(pnu);
    return { success: true, data: result };
  }

  // PNU 기반 Gemini 신축/리빌딩 분석
  // GET /api/v1/public-data/ai-newbuild?pnu=1168010100106180000
  @Get('ai-newbuild')
  async getAiNewbuild(@Query('pnu') pnu: string) {
    if (!pnu) {
      return { success: false, message: 'pnu is required' };
    }
    const result = await this.publicDataService.getAiNewbuildAnalysis(pnu);
    return { success: true, data: result };
  }

  // geom_score_layer 데이터 조회 (GeoJSON)
  // GET /api/v1/public-data/score-layer?minLat=...&minLng=...&maxLat=...&maxLng=...
  @Get('score-layer')
  async getScoreLayer(
    @Query('minLat') minLat: string,
    @Query('minLng') minLng: string,
    @Query('maxLat') maxLat: string,
    @Query('maxLng') maxLng: string,
  ) {
    if (!minLat || !minLng || !maxLat || !maxLng) {
      return { success: false, message: 'Bounding box coordinates are required' };
    }
    const result = await this.publicDataService.getScoreLayer(
      parseFloat(minLat),
      parseFloat(minLng),
      parseFloat(maxLat),
      parseFloat(maxLng),
    );
    return { success: true, data: result };
  }
}
