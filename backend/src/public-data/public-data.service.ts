import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

const UNLIMITED_MONTHLY_CREDITS = 2_147_483_647;
const DAILY_LIMIT_FOR_PRO_AND_MASTER = 50;

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

    // TODO: 남은 용적률/터잡이 지수 조회 테이블은 추후 변경 예정 (현재: master_map)
    const [masterMapMetric] = await this.prisma.$queryRaw<
      Array<{ remainingFar: number | null; teojabiScore: number | null }>
    >`
      SELECT
        "용적률차이" AS "remainingFar",
        "투자점수" AS "teojabiScore"
      FROM master_map
      WHERE pnu = ${pnu}
      LIMIT 1
    `;

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
      metrics: {
        remainingFar: masterMapMetric?.remainingFar ?? null,
        teojabiScore: masterMapMetric?.teojabiScore ?? null,
      },
    };
  }

  async getAiNewbuildAnalysis(
    pnu: string,
    userId: string,
  ): Promise<
    | {
        success: true;
        data: { summary: string };
        credit: {
          totalCredits: number;
          usedCredits: number;
          availableCredits: number;
        };
      }
    | {
        success: false;
        message: string;
        credit: {
          totalCredits: number;
          usedCredits: number;
          availableCredits: number;
        };
      }
  > {
    const credit = await this.consumeCreditForAiRequest(userId);
    if (!credit) {
      return {
        success: false,
        message: '분석 요청 가능한 크레딧이 없습니다.',
        credit: {
          totalCredits: 0,
          usedCredits: 0,
          availableCredits: 0,
        },
      };
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not configured');
      return {
        success: true,
        data: { summary: 'AI 분석 키가 설정되지 않아 결과를 생성할 수 없습니다.' },
        credit,
      };
    }

    const locationInfo = await this.getLocationInfo(pnu);
    if (!locationInfo) {
      return {
        success: true,
        data: { summary: '해당 필지의 건물·토지 정보가 없어 AI 분석을 진행할 수 없습니다.' },
        credit,
      };
    }

    const prompt = this.buildAiNewbuildPrompt(locationInfo);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              topP: 0.9,
              maxOutputTokens: 4096,
            },
          },
        ),
      );

      const usageMetadata = response.data?.usageMetadata;
      this.logger.log(
        `Gemini token usage for pnu=${pnu}: prompt=${usageMetadata?.promptTokenCount ?? 0}, candidates=${usageMetadata?.candidatesTokenCount ?? 0}, total=${usageMetadata?.totalTokenCount ?? 0}`,
      );

      const candidates = response.data?.candidates;
      const summary = Array.isArray(candidates)
        ? candidates
            .flatMap((candidate: any) => candidate?.content?.parts || [])
            .map((part: any) => part?.text)
            .filter((text: unknown) => typeof text === 'string' && text.trim())
            .join('\n')
            .trim()
        : '';

      if (!summary) {
        this.logger.warn(`Gemini returned empty response: pnu=${pnu}`);
        return {
          success: true,
          data: { summary: 'AI 분석 결과가 비어 있습니다. 잠시 후 다시 시도해 주세요.' },
          credit,
        };
      }

      return { success: true, data: { summary }, credit };
    } catch (error) {
      const err = error as {
        response?: { data?: unknown; status?: number };
        message?: string;
      };
      this.logger.error(
        `Gemini API error for pnu=${pnu}:`,
        err.response?.data || err.message || 'Unknown error',
      );
      return {
        success: true,
        data: {
          summary:
            'AI 분석 중 오류가 발생했습니다. 네트워크 상태 또는 사용량 제한을 확인한 뒤 다시 시도해 주세요.',
        },
        credit,
      };
    }
  }

  private async consumeCreditForAiRequest(userId: string): Promise<{
    totalCredits: number;
    usedCredits: number;
    availableCredits: number;
  } | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        CREATE TABLE IF NOT EXISTS user_credit_daily_usage (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
          usage_date DATE NOT NULL,
          used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
          created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, usage_date)
        )
      `;

      await tx.$executeRaw`
        INSERT INTO user_credit_wallet (user_id, total_credits, used_credits)
        VALUES (${userId}, 2, 0)
        ON CONFLICT (user_id) DO NOTHING
      `;

      const walletRows = await tx.$queryRaw<Array<{ total_credits: number; used_credits: number }>>`
        SELECT total_credits, used_credits
        FROM user_credit_wallet
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      if (walletRows.length === 0) {
        return null;
      }

      const totalCredits = Number(walletRows[0].total_credits || 0);
      const usedCredits = Number(walletRows[0].used_credits || 0);
      const isUnlimitedPlan = totalCredits >= UNLIMITED_MONTHLY_CREDITS;

      const planRows = await tx.$queryRaw<Array<{ code: string; amount: Prisma.Decimal }>>`
        SELECT sp.code, sp.amount
        FROM user_subscription us
        JOIN subscription_plan sp ON sp.id = us.plan_id
        WHERE us.user_id = ${userId}
          AND us.status = 'ACTIVE'
        ORDER BY us.updated_at DESC, us.created_at DESC
        LIMIT 1
      `;

      const activePlanCode = planRows[0]?.code ?? '';
      const activePlanAmount = planRows[0] ? Number(planRows[0].amount) : 0;
      const normalizedPlanCode = activePlanCode.toUpperCase();
      const dailyLimit =
        normalizedPlanCode.includes('PRO') ||
        normalizedPlanCode.includes('MASTER') ||
        normalizedPlanCode.includes('CONNECT') ||
        activePlanAmount === 40000 ||
        activePlanAmount === 180000
          ? DAILY_LIMIT_FOR_PRO_AND_MASTER
          : null;

      if (dailyLimit !== null) {
        const dailyRows = await tx.$queryRaw<Array<{ used_count: number }>>`
          INSERT INTO user_credit_daily_usage (user_id, usage_date, used_count)
          VALUES (${userId}, CURRENT_DATE, 0)
          ON CONFLICT (user_id, usage_date) DO NOTHING
          RETURNING used_count
        `;

        const currentDailyCount =
          dailyRows.length > 0
            ? Number(dailyRows[0].used_count || 0)
            : Number(
                (
                  await tx.$queryRaw<Array<{ used_count: number }>>`
                    SELECT used_count
                    FROM user_credit_daily_usage
                    WHERE user_id = ${userId}
                      AND usage_date = CURRENT_DATE
                    LIMIT 1
                  `
                )[0]?.used_count || 0,
              );

        if (currentDailyCount >= dailyLimit) {
          return null;
        }
      }

      const updatedRows = await tx.$queryRaw<
        Array<{ total_credits: number; used_credits: number }>
      >`
        UPDATE user_credit_wallet
        SET used_credits = used_credits + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}
          AND (total_credits - used_credits) > 0
        RETURNING total_credits, used_credits
      `;

      if (updatedRows.length === 0) {
        return null;
      }

      if (dailyLimit !== null) {
        await tx.$executeRaw`
          UPDATE user_credit_daily_usage
          SET used_count = used_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ${userId}
            AND usage_date = CURRENT_DATE
        `;
      }

      const nextTotalCredits = Number(updatedRows[0].total_credits || 0);
      const nextUsedCredits = Number(updatedRows[0].used_credits || 0);

      return {
        totalCredits: nextTotalCredits,
        usedCredits: nextUsedCredits,
        availableCredits: isUnlimitedPlan
          ? DAILY_LIMIT_FOR_PRO_AND_MASTER
          : Math.max(nextTotalCredits - nextUsedCredits, 0),
      };
    });
  }

  private buildAiNewbuildPrompt(locationInfo: any): string {
    const building = locationInfo?.building || {};
    const land = locationInfo?.land || {};
    const floorStatuses = Array.isArray(locationInfo?.floorStatuses)
      ? locationInfo.floorStatuses
      : [];
    const stores = Array.isArray(locationInfo?.stores) ? locationInfo.stores : [];

    const uniqueZoneTypes = Array.isArray(land.zoneTypes)
      ? land.zoneTypes
          .map((z: any) => ({
            name: z?.name ?? null,
            note: z?.note ?? null,
          }))
          .filter(
            (z: any) =>
              (typeof z.name === 'string' && z.name.trim()) ||
              (typeof z.note === 'string' && z.note.trim()),
          )
          .filter(
            (z: any, idx: number, arr: any[]) =>
              idx ===
              arr.findIndex(
                (t: any) =>
                  (t.name || '').trim() === (z.name || '').trim() &&
                  (t.note || '').trim() === (z.note || '').trim(),
              ),
          )
      : [];

    const officialPrices = Array.isArray(land.officialPrices)
      ? [...land.officialPrices]
          .sort((a: any, b: any) => Number(b?.year ?? 0) - Number(a?.year ?? 0))
          .slice(0, 3)
          .map((p: any) => ({
            year: p?.year ?? null,
            pricePerSqm: p?.pricePerSqm ?? null,
          }))
      : [];

    const inputData = {
      buildingRegister: {
        platArea: building?.platArea ?? null,
        totalFloorArea: building?.totalFloorArea ?? null,
        floorAreaRatio: building?.floorAreaRatio ?? null,
        groundFloors: building?.groundFloors ?? null,
        undergroundFloors: building?.undergroundFloors ?? null,
        structure: building?.structure ?? null,
        approvalDate: building?.approvalDate ?? null,
      },
      landRegister: {
        jimok: land?.jimok ?? null,
        zoneTypes: uniqueZoneTypes,
      },
      officialLandPrices: officialPrices,
      floorStatuses: floorStatuses.map((f: any) => ({
        flrArea: f?.flrArea ?? null,
        flrMainPurps: f?.flrMainPurps ?? null,
      })),
      stores: stores.map((s: any) => ({
        cateLargeNm: s?.cateLargeNm ?? null,
      })),
    };

    return `[Role: Persona]
당신은 '데이터 기반 상업용 부동산 ROI 분석가'입니다. 단순히 숫자를 나열하는 것을 넘어, 건축물대장, 토지대장, 실거래가 등 파편화된 데이터를 유기적으로 연결하여 해당 부동산의 현재 가치와 재건축(리빌딩) 시의 수익성을 정밀하게 진단합니다. 당신은 매우 논리적이고 객관적이지만, 전문 지식이 없는 건축주도 쉽게 이해할 수 있도록 친절하고 명쾌하게 설명하는 능력을 갖추고 있습니다.
[Knowledge & Context]
건축 및 공사비 전문 지식: 용적률, 건폐율 등 법규 검토 역량과 더불어 최신 표준 건축비, 철거비, 설계비, 각종 인허가 비용 등 재건축에 소요되는 제반 비용 산출 로직을 숙지하고 있습니다.
부동산 데이터 리터러시: 공시지가와 실거래가의 괴리를 파악하고, 지역별 임대 시세 데이터를 바탕으로 미래 가치를 추정합니다.
[Task Workflow: 5-Step Analysis]
제공된 데이터를 바탕으로 반드시 다음 5단계를 거쳐 분석을 수행하세요.
Step 1: 데이터 수집 및 구조화
입력된 [건축물대장, 토지대장, 토지공시지가, 과거 실거래가] 정보를 체계적으로 분류합니다.
Step 2: 결측치 보완 및 데이터 추정
누락된 데이터가 있다면 유사 지역 사례나 건축 연한, 인근 시세를 바탕으로 합리적인 추정치를 제시하고, 추정의 근거를 명시합니다.
Step 3: 현황 분석 (As-Is)
현재 노후도, 임대 효율, 토지 활용도를 분석하여 현재 부동산의 강점과 약점을 도출합니다.
Step 4: 리빌딩 기획 (To-Be)
해당 부지의 법정 최대 용적률을 활용한 최적의 건축 규모와 용도(예: 근생, 오피스 등)를 기획합니다.
Step 5: ROI(투자 수익률) 시뮬레이션
[사업비(공사비+기타비용)] 대비 [준공 후 예상 자산 가치 및 임대 수익]을 비교하여 최종 ROI를 산출합니다.
[Tone & Guidelines]
객관적 신뢰성: 모든 분석은 수치에 기반해야 하며, 주관적인 낙관론은 지양합니다.
친절한 전문성: 어려운 용어(예: 건폐율, 보정계수 등)는 괄호나 주석을 통해 쉽게 풀어서 설명하세요. 딱딱한 보고서 형식이 아닌, 전문가가 곁에서 설명해 주는 듯한 부드러운 말투를 유지합니다.
책임 한계 명시: 법적 규제나 정밀 구조 진단 등 완전한 건축 전문가의 실사가 필요한 부분은 별도의 '⚠️ 추가 확인 필요 사항' 섹션으로 구분하여 안내하십시오.
[Output Format]
사용자가 웹 화면에서 즉시 활용할 수 있도록 줄바꿈과 공백문자가 포함된 plain-text로 1200자의 정도의 길이로 작성하고 
문서의 기본목차는 
1. 현황 분석 (As-Is)
2. 리빌딩 기획 (To-Be)
3. ROI(투자 수익률) 시뮬레이션
4. 추가 확인 필요 사항
5. 결론 요약
아래는 분석 대상 데이터입니다. 반드시 이 데이터에 근거해 작성하세요.

${JSON.stringify(inputData)}`;
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
