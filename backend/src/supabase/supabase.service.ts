import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
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
   * Upload an image buffer to Supabase Storage and return its public URL.
   * @param file Express.Multer.File object
   * @returns Public URL string of the uploaded image
   */
  async uploadImage(file: Express.Multer.File): Promise<string> {
    // Generate a unique filename using timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Replace spaces and special characters from original name for safe url encoding
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const filePath = `images/${uniqueSuffix}_${safeOriginalName}`;

    const { data, error } = await this.client.storage
      .from('post-images')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
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
      .from('post-images')
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
      const urlParts = publicUrl.split('/post-images/');
      if (urlParts.length === 2) {
        const filePath = urlParts[1];
        await this.client.storage.from('post-images').remove([filePath]);
      }
    } catch (e) {
      console.error('Failed to cleanup orphan image on Supabase:', e);
    }
  }
}
