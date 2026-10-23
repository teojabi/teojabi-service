import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PublicDataService } from './public-data.service';

const MAX_BBOX_SPAN_DEGREES = 2;

@Controller('api/v1/public-data')
export class PublicDataController {
  constructor(private readonly publicDataService: PublicDataService) {}

  private parseBoundingBox(
    minLat: string,
    minLng: string,
    maxLat: string,
    maxLng: string,
  ): [number, number, number, number] | null {
    const values = [minLat, minLng, maxLat, maxLng].map(Number);
    if (!values.every(Number.isFinite)) return null;
    const [south, west, north, east] = values;
    if (south < -90 || north > 90 || west < -180 || east > 180) return null;
    if (south >= north || west >= east) return null;
    if (north - south > MAX_BBOX_SPAN_DEGREES || east - west > MAX_BBOX_SPAN_DEGREES) return null;
    return [south, west, north, east];
  }

  @Get()
  async getPublicData(@Query('address') address: string) {
    const normalized = String(address ?? '').trim().slice(0, 200);
    if (!normalized) {
      return { success: false, message: 'Address is required' };
    }
    const data = await this.publicDataService.getPublicData(normalized);
    return { success: true, data };
  }

  // 키워드(장소명) 검색 → 위경도 좌표 반환
  // GET /api/v1/public-data/search?query=서당초등학교
  @Get('search')
  async searchByKeyword(@Query('query') query: string) {
    const normalized = String(query ?? '').trim().slice(0, 80);
    if (!normalized) {
      return { success: false, message: 'query is required' };
    }
    const result = await this.publicDataService.searchByKeyword(normalized);
    return { success: true, data: result };
  }

  // PNU 기반 건물/토지/층별현황/상가 정보 조회
  // GET /api/v1/public-data/location-info?pnu=1168010100106180000
  @Get('location-info')
  async getLocationInfo(@Query('pnu') pnu: string) {
    const normalized = String(pnu ?? '').trim();
    if (!/^\d{19}$/.test(normalized)) {
      return { success: false, message: 'pnu is invalid' };
    }
    const result = await this.publicDataService.getLocationInfo(normalized);
    return { success: true, data: result };
  }

  // PNU 기반 Gemini 신축/리빌딩 분석
  // GET /api/v1/public-data/ai-newbuild?pnu=1168010100106180000
  @Get('ai-newbuild')
  @UseGuards(JwtAuthGuard)
  async getAiNewbuild(@Req() req: Request, @Query('pnu') pnu: string) {
    if (!pnu) {
      return { success: false, message: 'pnu is required' };
    }
    const user = req.user as { id: string };
    const result = await this.publicDataService.getAiNewbuildAnalysis(
      pnu,
      user.id,
    );

    if (!result.success) {
      return { success: false, message: result.message, credit: result.credit };
    }

    return { success: true, data: result.data, credit: result.credit };
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
    const bbox = this.parseBoundingBox(minLat, minLng, maxLat, maxLng);
    if (!bbox) {
      return { success: false, message: 'Bounding box coordinates are invalid' };
    }
    const [south, west, north, east] = bbox;
    const result = await this.publicDataService.getScoreLayer(south, west, north, east);
    return { success: true, data: result };
  }

  // education_safezones 데이터 조회 (GeoJSON)
  // GET /api/v1/public-data/education-safezones-layer?minLat=...&minLng=...&maxLat=...&maxLng=...
  @Get('education-safezones-layer')
  async getEducationSafezonesLayer(
    @Query('minLat') minLat: string,
    @Query('minLng') minLng: string,
    @Query('maxLat') maxLat: string,
    @Query('maxLng') maxLng: string,
  ) {
    const bbox = this.parseBoundingBox(minLat, minLng, maxLat, maxLng);
    if (!bbox) {
      return { success: false, message: 'Bounding box coordinates are invalid' };
    }
    const [south, west, north, east] = bbox;
    const result = await this.publicDataService.getEducationSafezonesLayer(south, west, north, east);
    return { success: true, data: result };
  }

  // tour_zones 데이터 조회 (GeoJSON)
  // GET /api/v1/public-data/tour-zones-layer?minLat=...&minLng=...&maxLat=...&maxLng=...
  @Get('tour-zones-layer')
  async getTourZonesLayer(
    @Query('minLat') minLat: string,
    @Query('minLng') minLng: string,
    @Query('maxLat') maxLat: string,
    @Query('maxLng') maxLng: string,
  ) {
    const bbox = this.parseBoundingBox(minLat, minLng, maxLat, maxLng);
    if (!bbox) {
      return { success: false, message: 'Bounding box coordinates are invalid' };
    }
    const [south, west, north, east] = bbox;
    const result = await this.publicDataService.getTourZonesLayer(south, west, north, east);
    return { success: true, data: result };
  }
}
