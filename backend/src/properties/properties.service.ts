import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PropertiesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly supabaseService: SupabaseService
    ) { }

    async findAll() {
        return this.prisma.$queryRaw`
            SELECT id, title, description, address, price, images,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            ORDER BY "createdAt" DESC
            LIMIT 50;
        `;
    }

    async findById(id: string) {
        const rows = await this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, price, images,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            WHERE id = ${id}
        `;
        return rows.length > 0 ? rows[0] : null;
    }

    async createProperty(data: any, file?: Express.Multer.File) {
        let imageUrl: string | null = null;
        
        // 1. 이미지 파일이 있으면 먼저 Supabase Storage에 업로드
        if (file) {
            imageUrl = await this.supabaseService.uploadImage(file);
        }

        try {
            // 2. DB에 데이터 적재
            const { title, description, address, price, lat, lng, ownerId } = data;
            
            // Decimal 값이 빈 문자열로 오면 null 처리. 위경도도 마찬가지로 방어.
            const refinedPrice = price ? Number(price) : null;
            const refinedLat = lat ? Number(lat) : 0;
            const refinedLng = lng ? Number(lng) : 0;
            
            // Prisma queryRaw에서 배열 저장 방식 
            const imagesArray = imageUrl ? [imageUrl] : [];

            const result = await this.prisma.$queryRaw<any[]>`
                INSERT INTO "Property" ("id", "title", "description", "address", "price", "images", "location", "ownerId", "updatedAt")
                VALUES (gen_random_uuid(), ${title}, ${description}, ${address}, ${refinedPrice}, ${imagesArray}, ST_SetSRID(ST_MakePoint(${refinedLng}, ${refinedLat}), 4326), ${ownerId || null}, NOW())
                RETURNING id, title, images;
            `;
            return result[0];
        } catch (error) {
            // 3. DB Insert 실패 시, 스토리지에 올라간 이미지 롤백(삭제)
            if (imageUrl) {
                console.error('DB Insert failed, rolling back uploaded image:', imageUrl);
                await this.supabaseService.deleteImageByUrl(imageUrl);
            }
            throw error;
        }
    }

    async findNearby(lat: number, lng: number, radius: number) {
        // radius in meters
        const degreeRadius = radius / 111320.0;
        return this.prisma.$queryRaw`
            SELECT id, title, description, address, price, 
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
                   ST_DistanceSphere(location, ST_MakePoint(${lng}, ${lat})) as distance
            FROM "Property"
            WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${degreeRadius})
            ORDER BY distance ASC
            LIMIT 50;
        `;
    }
}
