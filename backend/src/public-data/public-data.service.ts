import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PublicDataService {
  private readonly logger = new Logger(PublicDataService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ?�정 주소???�이?��? ?��? API?�서 조회 (캐시 ?�이 직접 반환)
  async syncAddress(address: string) {
    this.logger.debug(`Fetching external data for ${address}`);

    // TODO: ?�제 공공?�이??API ?�동 ??주석 ?�제 ??구현
    // const apiUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_UQ111&key=YOUR_KEY&domain=http://localhost:3000&attrFilter=ldCode:like:${address}`;
    // const response = await firstValueFrom(this.httpService.get(apiUrl));
    // const apiData = response.data;

    // ?�시 모의 ?�이??(?�제 DB???�?�하지 ?�고 직접 반환)
    const mockOfficialPrice = Math.floor(Math.random() * 5000) + 1000;
    const mockActualPrice = mockOfficialPrice * 1.5;
    const mockLandUsePlan = "제2종일반주거지역";

    return {
      address,
      officialPrice: mockOfficialPrice,
      actualPrice: mockActualPrice,
      landUsePlan: mockLandUsePlan,
      syncedAt: new Date(),
    };
  }

  // ?�론?�엔??API?�서 ?�이???�건 조회 ?�청 (캐시 ?�이 즉시 조회 ??반환)
  async getPublicData(address: string) {
    return this.syncAddress(address);
  }

  // PNU 기반 건물·?��?·층별?�황·?��? ?�보 DB 조회
  async getLocationInfo(pnu: string): Promise<any> {
    this.logger.debug(`getLocationInfo called: pnu=${pnu}`);

    const building = await this.prisma.buildingInfo.findUnique({
      where: { pnu },
      include: {
        floorStatuses: { orderBy: [{ flrSortNo: 'desc' }, { flrNo: 'asc' }] },
        stores: { orderBy: { storeNm: 'asc' } },
      },
    });

    if (!building) {
      return null;
    }

    // ?�도지??목록 (복수)
    const landUseList = await this.prisma.landUseInfo.findMany({
      where: { pnu },
    });

    // ?�도�?공시지가 (복수, 최신??
    const priceList = await this.prisma.officialLandPrice.findMany({
      where: { pnu },
      orderBy: { refYear: 'desc' },
    });

    // ?�도지???구명?�로 법정 건폐???�적�?매칭
    const zoneNames = landUseList
      .map((l) => l.zoneClsNm)
      .filter((n): n is string => !!n);
    const matchedRegulations =
      zoneNames.length > 0
        ? await this.prisma.zoningRegulation.findMany({
            where: { zoneName: { in: zoneNames } },
          })
        : [];

    // 매칭 결과가 ?�확??1건일 ?�만 ?�용, �??�는 null
    const regulation =
      matchedRegulations.length === 1
        ? {
            zoneName: matchedRegulations[0].zoneName,
            bcrLimit: matchedRegulations[0].bcrLimit,
            farLimit: matchedRegulations[0].farLimit,
            farLimitNote: matchedRegulations[0].farLimitNote,
          }
        : null;

    // PNU?�서 ?�?�구�?추출 (11번째 ?�리: 1=?�반, 2=??
    const landTypeCode = pnu.charAt(10);
    const jimok = landTypeCode === "2" ? "산" : "일반";

    return {
      building: {
        pnu: building.pnu,
        name: building.bldNm,
        mainPurpose: building.mainPurpsCdNm,
        platArea: building.platArea,
        archArea: building.archArea,
        totalFloorArea: building.totArea,
        buildingCoverageRatio: building.bcRat,
        floorAreaRatio: building.vlRat,
        groundFloors: building.grndFlrCnt,
        undergroundFloors: building.ugndFlrCnt,
        buildingHeight: building.buildingHeight,
        structure: building.strctCdNm,
        approvalDate: building.useAprDay,
      },
      land: {
        platArea: building.platArea,
        jimok,
        zoneTypes: landUseList.map((l) => ({
          code: l.zoneClsCd,
          name: l.zoneClsNm,
          note: l.note,
        })),
        regulation,
        officialPrices: priceList.map((p) => ({
          year: p.refYear,
          pricePerSqm: p.pricePerSqm.toString(),
        })),
      },
      floorStatuses: building.floorStatuses.map((f) => ({
        flrNo: f.flrNo,
        flrNoNm: f.flrNoNm,
        flrSortNo: f.flrSortNo,
        flrArea: f.flrArea,
        flrMainPurps: f.flrMainPurps,
        strctCdNm: f.strctCdNm,
      })),
      stores: building.stores.map((s) => ({
        storeId: s.storeId,
        storeNm: s.storeNm,
        cateLargeNm: s.cateLargeNm,
        cateMidNm: s.cateMidNm,
        flrNo: s.flrNo,
        hoNo: s.hoNo,
      })),
    };
  }

  // ?�워??POI) 검?? ?�이�?로컬 검??API�??�해 ?�보 반환
  async searchByKeyword(query: string): Promise<any[]> {
    const clientId = this.configService.get<string>('NAVER_CLIENT_ID');
    const clientSecret = this.configService.get<string>('NAVER_CLIENT_SECRET');

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://openapi.naver.com/v1/search/local.json', {
          params: { query, display: 5, start: 1, sort: 'random' },
          headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
          },
        }),
      );

      this.logger.debug(
        `Naver Local Search API response status: ${response.status}`,
      );
      const items = response.data?.items;
      this.logger.debug(
        `Found ${items?.length || 0} items for query: ${query}`,
      );

      if (!items || items.length === 0) return [];

      return items.map((item: any) => ({
        title: item.title.replace(/<[^>]*>/g, ''),
        address: item.roadAddress || item.address,
        category: item.category,
        mapx: Number(item.mapx),
        mapy: Number(item.mapy),
        raw: item, // ?�론?�엔?�에??추�? 좌표 ?�드(x, y ??�?참조?????�도�??�본 ?�이???�함
      }));
    } catch (error) {
      const err = error as {
        response?: {
          data?: unknown;
        };
        message?: string;
      };

      this.logger.error(
        `Naver Local Search API error for query "${query}":`,
        err.response?.data || err.message || 'Unknown error',
      );
      return [];
    }
  }

  // ?�재 지???�역 ?�의 geom_score_layer ?�이?��? GeoJSON?�로 반환
  async getScoreLayer(
    minLat: number,
    minLng: number,
    maxLat: number,
    maxLng: number,
  ) {
    const result = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT 
        pnu,
        score_grade as "scoreGrade",
        ST_AsGeoJSON(ST_Transform(geom, 4326))::json as geometry
      FROM geom_score_layer
      WHERE geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), ST_SRID(geom))
      LIMIT 2000
    `,
      minLng,
      minLat,
      maxLng,
      maxLat,
    );

    return {
      type: "FeatureCollection",
      features: result.map((row) => ({
        type: "Feature",
        geometry: row.geometry,
        properties: {
          pnu: row.pnu,
          scoreGrade: row.scoreGrade,
        },
      })),
    };
  }
}
