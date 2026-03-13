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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertiesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let PropertiesService = class PropertiesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.$queryRaw `
            SELECT id, title, description, address, price, 
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            ORDER BY "createdAt" DESC
            LIMIT 50;
        `;
    }
    async findById(id) {
        const rows = await this.prisma.$queryRaw `
            SELECT id, title, description, address, price, 
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            WHERE id = ${id}
        `;
        return rows.length > 0 ? rows[0] : null;
    }
    async createProperty(data) {
        const { title, description, address, price, lat, lng, ownerId } = data;
        const result = await this.prisma.$queryRaw `
            INSERT INTO "Property" ("id", "title", "description", "address", "price", "location", "ownerId", "updatedAt")
            VALUES (gen_random_uuid(), ${title}, ${description}, ${address}, ${price}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${ownerId || null}, NOW())
            RETURNING id, title;
        `;
        return result[0];
    }
    async findNearby(lat, lng, radius) {
        const degreeRadius = radius / 111320.0;
        return this.prisma.$queryRaw `
            SELECT id, title, description, address, price, 
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
                   ST_DistanceSphere(location, ST_MakePoint(${lng}, ${lat})) as distance
            FROM "Property"
            WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${degreeRadius})
            ORDER BY distance ASC
            LIMIT 50;
        `;
    }
};
exports.PropertiesService = PropertiesService;
exports.PropertiesService = PropertiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PropertiesService);
//# sourceMappingURL=properties.service.js.map