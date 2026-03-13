import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PublicDataService {
    private readonly logger = new Logger(PublicDataService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly prisma: PrismaService,
    ) { }

    // 매일 자정(02:00)에 데이터 갱신 실행 (예시)
    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async handleCron() {
        this.logger.debug('Running nightly job to sync Public Data');

        // DB에 저장된 모든 PublicData 엔티티를 조회하여 갱신
        const trackedData = await this.prisma.publicData.findMany();

        for (const data of trackedData) {
            try {
                await this.syncAddress(data.address);
            } catch (error) {
                this.logger.error(`Failed to sync data for address: ${data.address}`, error);
            }
        }
    }

    // 특정 주소의 데이터를 외부 API에서 조회 후 DB 갱신 (또는 생성)
    async syncAddress(address: string) {
        this.logger.debug(`Syncing data for ${address}`);

        // TODO: 실제 공공데이터 API 연동 시 주석 해제 후 구현
        // const apiUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_UQ111&key=YOUR_KEY&domain=http://localhost:3000&attrFilter=ldCode:like:${address}`;
        // const response = await firstValueFrom(this.httpService.get(apiUrl));
        // const apiData = response.data;

        // 임시 모의 데이터
        const mockOfficialPrice = Math.floor(Math.random() * 5000) + 1000;
        const mockActualPrice = mockOfficialPrice * 1.5;
        const mockLandUsePlan = "제2종 일반주거지역";

        const result = await this.prisma.publicData.upsert({
            where: { address },
            update: {
                officialPrice: mockOfficialPrice,
                actualPrice: mockActualPrice,
                landUsePlan: mockLandUsePlan,
                syncedAt: new Date(),
            },
            create: {
                address,
                officialPrice: mockOfficialPrice,
                actualPrice: mockActualPrice,
                landUsePlan: mockLandUsePlan,
                syncedAt: new Date(),
            },
        });

        return result;
    }

    // 프론트엔드/API에서 데이터 단건 조회 요청 (없으면 즉시 동기화 후 반환)
    async getPublicData(address: string) {
        let data = await this.prisma.publicData.findUnique({ where: { address } });

        // 캐싱된 데이터가 30일이 넘었거나 없으면 On-Demand 갱신
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (!data || (Date.now() - new Date(data.syncedAt).getTime() > THIRTY_DAYS)) {
            data = await this.syncAddress(address);
        }

        return data;
    }
}
