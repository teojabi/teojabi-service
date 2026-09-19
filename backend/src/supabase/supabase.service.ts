import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase URL or Key is missing. Check .env configuration.');
    }

    this.client = createClient(supabaseUrl || '', supabaseKey || '');
  }

  /**
   * 큰 이미지를 자동으로 리사이즈·압축한다. 실패하면 원본을 그대로 쓴다.
   * @param file Express.Multer.File object
   * @param maxWidth 가로 최대 픽셀
   */
  private async compressImage(file: any, maxWidth = 1600, aspect?: string): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
    if (!file?.buffer) return { buffer: file?.buffer ?? Buffer.alloc(0), contentType: file?.mimetype ?? 'application/octet-stream', ext: 'bin' };
    try {
      const image = sharp(file.buffer, { failOn: 'none' });
      const meta = await image.metadata();
      const needsResize = (meta.width ?? 0) > maxWidth;
      let pipeline = needsResize ? image.resize({ width: maxWidth, withoutEnlargement: true }) : image;
      // 대표 이미지는 지정 비율(예: 4:3)로 잘라 채운다.
      if (aspect === '4:3') pipeline = pipeline.resize({ width: maxWidth, height: Math.round(maxWidth * 3 / 4), fit: 'cover', position: 'centre' });
      // 투명도가 없는 사진은 JPEG로, PNG 투명 이미지는 WebP로 압축한다.
      if (meta.hasAlpha) {
        const buffer = await pipeline.webp({ quality: 82 }).toBuffer();
        return { buffer, contentType: 'image/webp', ext: 'webp' };
      }
      const buffer = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      return { buffer, contentType: 'image/jpeg', ext: 'jpg' };
    } catch (error) {
      this.logger.warn(`이미지 압축을 건너뜁니다: ${(error as Error).message}`);
      return { buffer: file.buffer, contentType: file.mimetype, ext: (file.originalname?.split('.').pop() || 'bin').toLowerCase() };
    }
  }

  /**
   * Upload an image buffer to Supabase Storage and return its public URL.
   * @param file Express.Multer.File object
   * @param options.maxWidth 가로 최대 픽셀, options.aspect 자를 비율(예: '4:3')
   * @returns Public URL string of the uploaded image
   */
  async uploadImage(file: any, options: { maxWidth?: number; aspect?: string } = {}): Promise<string> {
    const bucketName =
      this.configService.get<string>('SUPABASE_BUCKET') || 'post-images';

    // 버킷 존재 여부 확인 및 자동 생성 시도 (Optional, but good for robust setup)
    const { data: buckets } = await this.client.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === bucketName);

    if (!bucketExists) {
      console.log(`Bucket '${bucketName}' not found. Attempting to create...`);
      const { error: createError } = await this.client.storage.createBucket(
        bucketName,
        {
          public: true,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
          ],
        },
      );
      if (createError) {
        console.error(`Failed to create bucket '${bucketName}':`, createError);
        throw new InternalServerErrorException(
          `버킷 '${bucketName}'을 찾을 수 없으며 자동 생성에도 실패했습니다.`,
        );
      }
      console.log(`Bucket '${bucketName}' created successfully.`);
    }

    // Generate a unique filename using timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const compressed = await this.compressImage(file, options.maxWidth ?? 1600, options.aspect);
    const filePath = `images/${uniqueSuffix}.${compressed.ext}`;

    const { data, error } = await this.client.storage
      .from(bucketName)
      .upload(filePath, compressed.buffer, {
        contentType: compressed.contentType,
        upsert: false,
      });

    if (error) {
      console.error('Supabase raw error:', error);
      throw new InternalServerErrorException(
        `이미지 업로드에 실패했습니다: ${error.message}`,
      );
    }

    // Retrieve public URL
    const { data: urlData } = this.client.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  /**
   * Rollback/Delete an image from Supabase Storage
   * Useful when DB insertion fails after a successful file upload
   */
  async deleteImageByUrl(publicUrl: string): Promise<void> {
    try {
      // Extract the object path from the public URL
      // Example URL: https://[projectId].supabase.co/storage/v1/object/public/post-images/images/123_abc.jpg
      const bucketName =
        this.configService.get<string>('SUPABASE_BUCKET') || 'post-images';
      const searchStr = `/${bucketName}/`;
      const index = publicUrl.indexOf(searchStr);

      if (index !== -1) {
        const filePath = publicUrl.substring(index + searchStr.length);
        await this.client.storage.from(bucketName).remove([filePath]);
      } else {
        console.warn('Could not extract file path from public URL:', publicUrl);
      }
    } catch (e) {
      console.error('Failed to cleanup orphan image on Supabase:', e);
    }
  }
}
