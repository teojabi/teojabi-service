import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) { }

  async findAll() {
    return this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, pnu, price, before_image, after_image,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM property
            ORDER BY "createdAt" DESC
            LIMIT 50;
        `.then((rows) =>
      rows.map((row) => ({
        ...row,
        price: row.price ? Number(row.price) : null,
      })),
    );
  }

  async findById(id: string) {
    if (!id) return null;
    const rows = await this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, pnu, price, before_image, after_image,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM property
            WHERE id = ${id}
        `;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      price: row.price ? Number(row.price) : null,
    };
  }

  async findByOwnerId(ownerId: string) {
    if (!ownerId) return [];
    return this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, pnu, price, before_image, after_image, "createdAt",
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM property
            WHERE "ownerId" = ${ownerId}
            ORDER BY "createdAt" DESC;
        `.then((rows) =>
      rows.map((row) => ({
        ...row,
        price: row.price ? Number(row.price) : null,
      })),
    );
  }

  async createProperty(data: any, files?: { beforeImage?: Express.Multer.File[], afterImage?: Express.Multer.File[] }) {
    const { title, description, address, price, lat, lng, pnu, ownerId } = data;

    if (!title || !address) {
      throw new Error('Title and address are required');
    }

    let beforeImageUrl: string | null = null;
    let afterImageUrl: string | null = null;

    try {
      // 1. 이미지 파일 업로드
      if (files?.beforeImage?.[0]) {
        beforeImageUrl = await this.supabaseService.uploadImage(files.beforeImage[0]);
      }
      if (files?.afterImage?.[0]) {
        afterImageUrl = await this.supabaseService.uploadImage(files.afterImage[0]);
      }

      // 2. DB에 데이터 적재
      const refinedPrice = price ? Number(price) : null;
      let refinedLat = lat ? Number(lat) : 0;
      let refinedLng = lng ? Number(lng) : 0;
      let pnuStr = pnu || null;

      const result = await this.prisma.$queryRaw<any[]>`
                INSERT INTO property (id, title, description, address, pnu, price, before_image, after_image, location, "ownerId", "updatedAt", "createdAt")
                VALUES (gen_random_uuid(), ${title}, ${description}, ${address}, ${pnuStr}, ${refinedPrice}, ${beforeImageUrl}, ${afterImageUrl}, ST_SetSRID(ST_MakePoint(${refinedLng}, ${refinedLat}), 4326), ${ownerId || null}, NOW(), NOW())
                RETURNING id, title;
            `;
      return result[0];
    } catch (error) {
      // 3. 실패 시 롤백
      if (beforeImageUrl) await this.supabaseService.deleteImageByUrl(beforeImageUrl);
      if (afterImageUrl) await this.supabaseService.deleteImageByUrl(afterImageUrl);
      throw error;
    }
  }

  async updateProperty(id: string, data: any, files?: { beforeImage?: Express.Multer.File[], afterImage?: Express.Multer.File[] }) {
    const { title, description, address, price, lat, lng, pnu } = data;

    const existing = await this.findById(id);
    if (!existing) throw new Error('Property not found');

    let newBeforeImageUrl: string | null = null;
    let newAfterImageUrl: string | null = null;

    try {
      if (files?.beforeImage?.[0]) {
        newBeforeImageUrl = await this.supabaseService.uploadImage(files.beforeImage[0]);
        if (existing.before_image) await this.supabaseService.deleteImageByUrl(existing.before_image);
      }
      if (files?.afterImage?.[0]) {
        newAfterImageUrl = await this.supabaseService.uploadImage(files.afterImage[0]);
        if (existing.after_image) await this.supabaseService.deleteImageByUrl(existing.after_image);
      }

      const refinedPrice = price !== undefined ? Number(price) : existing.price;
      let refinedLat = lat !== undefined ? Number(lat) : existing.lat;
      let refinedLng = lng !== undefined ? Number(lng) : existing.lng;
      let newPnu = pnu !== undefined ? (pnu || null) : existing.pnu;

      await this.prisma.$executeRaw`
                UPDATE property
                SET title = ${title || existing.title},
                    description = ${description || existing.description},
                    address = ${address || existing.address},
                    pnu = ${newPnu},
                    price = ${refinedPrice},
                    before_image = ${newBeforeImageUrl || existing.before_image},
                    after_image = ${newAfterImageUrl || existing.after_image},
                    location = ST_SetSRID(ST_MakePoint(${refinedLng}, ${refinedLat}), 4326),
                    "updatedAt" = NOW()
                WHERE id = ${id};
            `;

      return { id, title };
    } catch (error) {
      if (newBeforeImageUrl) await this.supabaseService.deleteImageByUrl(newBeforeImageUrl);
      if (newAfterImageUrl) await this.supabaseService.deleteImageByUrl(newAfterImageUrl);
      throw error;
    }
  }

  async deleteProperty(id: string) {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Property not found');

    if (existing.before_image) await this.supabaseService.deleteImageByUrl(existing.before_image);
    if (existing.after_image) await this.supabaseService.deleteImageByUrl(existing.after_image);

    await this.prisma.$executeRaw`DELETE FROM property WHERE id = ${id}`;
    return { success: true, id };
  }

  async findNearby(lat: number, lng: number, radius: number) {
    // radius in meters
    const degreeRadius = radius / 111320.0;
    return this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, pnu, price, before_image, after_image,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
                   ST_DistanceSphere(location, ST_MakePoint(${lng}, ${lat})) as distance
            FROM property
            WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${degreeRadius})
            ORDER BY distance ASC
            LIMIT 50;
        `.then((rows) =>
      rows.map((row) => ({
        ...row,
        price: row.price ? Number(row.price) : null,
      })),
    );
  }

  async findInBounds(
    neLat: number,
    neLng: number,
    swLat: number,
    swLng: number,
  ) {
    const minLat = Math.min(neLat, swLat);
    const maxLat = Math.max(neLat, swLat);
    const minLng = Math.min(neLng, swLng);
    const maxLng = Math.max(neLng, swLng);

    // Using PostGIS to find points within bounding box
    return this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, pnu, price, before_image, after_image,
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM property
            WHERE location && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
            LIMIT 200;
        `.then((rows) =>
      rows.map((row) => ({
        ...row,
        price: row.price ? Number(row.price) : null,
      })),
    );
  }
}
