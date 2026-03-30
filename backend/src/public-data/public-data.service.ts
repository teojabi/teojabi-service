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

  // 특정 주소의 데이터를 외부 API에서 조회 (캐시 없이 직접 반환)
  async syncAddress(address: string) {
    this.logger.debug(`Fetching external data for ${address}`);

    // TODO: 실제 공공데이터 API 연동 시 주석 해제 후 구현
    // const apiUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_UQ111&key=YOUR_KEY&domain=http://localhost:3000&attrFilter=ldCode:like:${address}`;
    // const response = await firstValueFrom(this.httpService.get(apiUrl));
    // const apiData = response.data;

    // 임시 모의 데이터 (이제 DB에 저장하지 않고 직접 반환)
    const mockOfficialPrice = Math.floor(Math.random() * 5000) + 1000;
    const mockActualPrice = mockOfficialPrice * 1.5;
    const mockLandUsePlan = '제2종 일반주거지역';

    return {
      address,
      officialPrice: mockOfficialPrice,
      actualPrice: mockActualPrice,
      landUsePlan: mockLandUsePlan,
      syncedAt: new Date(),
    };
  }

  // 프론트엔드/API에서 데이터 단건 조회 요청 (캐시 없이 즉시 조회 후 반환)
  async getPublicData(address: string) {
    return this.syncAddress(address);
  }

  // PNU 기반 건물·토지·층별현황·상가 정보 DB 조회
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

    // 용도지역 목록 (복수)
    const landUseList = await this.prisma.landUseInfo.findMany({
      where: { pnu },
    });

    // 연도별 공시지가 (복수, 최신순)
    const priceList = await this.prisma.officialLandPrice.findMany({
      where: { pnu },
      orderBy: { refYear: 'desc' },
    });

    // 용도지역지구명으로 법정 건폐율/용적률 매칭
    const zoneNames = landUseList
      .map((l) => l.zoneClsNm)
      .filter((n): n is string => !!n);
    const matchedRegulations =
      zoneNames.length > 0
        ? await this.prisma.zoningRegulation.findMany({
            where: { zoneName: { in: zoneNames } },
          })
        : [];

    // 매칭 결과가 정확히 1건일 때만 사용, 그 외는 null
    const regulation =
      matchedRegulations.length === 1
        ? {
            zoneName: matchedRegulations[0].zoneName,
            bcrLimit: matchedRegulations[0].bcrLimit,
            farLimit: matchedRegulations[0].farLimit,
            farLimitNote: matchedRegulations[0].farLimitNote,
          }
        : null;

    // PNU에서 대장구분 추출 (11번째 자리: 1=일반, 2=산)
    const landTypeCode = pnu.charAt(10);
    const jimok = landTypeCode === '2' ? '산' : '일반';

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

  // 키워드(POI) 검색: 네이버 로컬 검색 API를 통해 정보 반환
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
        raw: item, // 프론트엔드에서 추가 좌표 필드(x, y 등)를 참조할 수 있도록 원본 데이터 포함
      }));
    } catch (error) {
      this.logger.error(
        `Naver Local Search API error for query "${query}":`,
        error?.response?.data || error.message,
      );
      return [];
    }
  }
}
