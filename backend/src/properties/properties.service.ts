import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PropertiesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly supabaseService: SupabaseService
    ) { }

    private parseImages(images: any): string[] {
        if (Array.isArray(images)) return images;
        if (typeof images === 'string') {
            // PostgreSQL array string literal format: {item1,item2}
            if (images.startsWith('{') && images.endsWith('}')) {
                return images.slice(1, -1).split(',').filter(s => s !== '');
            }
        }
        return [];
    }

    async findAll() {
        return this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, price, images,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            ORDER BY "createdAt" DESC
            LIMIT 50;
        `.then(rows => rows.map(row => ({
            ...row,
            images: this.parseImages(row.images)
        })));
    }

    async findById(id: string) {
        if (!id) return null;
        const rows = await this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, price, images,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            WHERE id = ${id}
        `;
        if (rows.length === 0) return null;
        const row = rows[0];
        return {
            ...row,
            images: this.parseImages(row.images)
        };
    }

    async createProperty(data: any, file?: Express.Multer.File) {
        const { title, description, address, price, lat, lng, ownerId } = data;
        
        if (!title || !address) {
            throw new Error('Title and address are required');
        }

        let imageUrl: string | null = null;
        
        // 1. 이미지 파일이 있으면 먼저 Supabase Storage에 업로드
        if (file) {
            imageUrl = await this.supabaseService.uploadImage(file);
        }

        try {
            // 2. DB에 데이터 적재
            
            // Decimal 값이 빈 문자열로 오면 null 처리. 위경도도 마찬가지로 방어.
            const refinedPrice = price ? Number(price) : null;
            const refinedLat = lat ? Number(lat) : 0;
            const refinedLng = lng ? Number(lng) : 0;
            
            // Prisma queryRaw에서 배열 저장 방식 
            const imagesArray = imageUrl ? [imageUrl] : [];

            const result = await this.prisma.$queryRaw<any[]>`
                INSERT INTO "Property" ("id", "title", "description", "address", "price", "images", "location", "ownerId", "updatedAt", "createdAt")
                VALUES (gen_random_uuid(), ${title}, ${description}, ${address}, ${refinedPrice}, ${imagesArray}, ST_SetSRID(ST_MakePoint(${refinedLng}, ${refinedLat}), 4326), ${ownerId || null}, NOW(), NOW())
                RETURNING id, title, images;
            `;
            return result[0];
        } catch (error) {
            // 3. DB Insert 실패 시, 스토리지에 올라간 이미지 롤백(삭제)
            if (imageUrl) {
                console.error('DB Insert failed, rolling back uploaded image:', imageUrl);
                try {
                    await this.supabaseService.deleteImageByUrl(imageUrl);
                } catch (rollbackError) {
                    console.error('Failed to rollback image during DB failure:', rollbackError);
                }
            }
            throw error;
        }
    }

    async findNearby(lat: number, lng: number, radius: number) {
        // radius in meters
        const degreeRadius = radius / 111320.0;
        return this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, price, images,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
                   ST_DistanceSphere(location, ST_MakePoint(${lng}, ${lat})) as distance
            FROM "Property"
            WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${degreeRadius})
            ORDER BY distance ASC
            LIMIT 50;
        `.then(rows => rows.map(row => ({
            ...row,
            images: this.parseImages(row.images)
        })));
    }
}
