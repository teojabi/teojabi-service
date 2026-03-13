"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PublicDataService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicDataService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
let PublicDataService = PublicDataService_1 = class PublicDataService {
    constructor(httpService, prisma) {
        this.httpService = httpService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(PublicDataService_1.name);
    }
    async handleCron() {
        this.logger.debug('Running nightly job to sync Public Data');
        const trackedData = await this.prisma.publicData.findMany();
        for (const data of trackedData) {
            try {
                await this.syncAddress(data.address);
            }
            catch (error) {
                this.logger.error(`Failed to sync data for address: ${data.address}`, error);
            }
        }
    }
    async syncAddress(address) {
        this.logger.debug(`Syncing data for ${address}`);
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
    async getPublicData(address) {
        let data = await this.prisma.publicData.findUnique({ where: { address } });
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (!data || (Date.now() - new Date(data.syncedAt).getTime() > THIRTY_DAYS)) {
            data = await this.syncAddress(address);
        }
        return data;
    }
};
exports.PublicDataService = PublicDataService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_2AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PublicDataService.prototype, "handleCron", null);
exports.PublicDataService = PublicDataService = PublicDataService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        prisma_service_1.PrismaService])
], PublicDataService);
//# sourceMappingURL=public-data.service.js.map