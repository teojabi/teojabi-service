import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ArchitectsController } from './architects.controller';
import { ArchitectsService } from './architects.service';

@Module({
  imports: [SupabaseModule],
  providers: [ArchitectsService],
  controllers: [ArchitectsController],
})
export class ArchitectsModule {}
