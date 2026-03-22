import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PublicDataService } from './public-data.service';
import { PublicDataController } from './public-data.controller';
import { PublicDataBatchService } from './public-data-batch.service';

@Module({
  imports: [HttpModule],
  providers: [PublicDataService, PublicDataBatchService],
  controllers: [PublicDataController],
  exports: [PublicDataService, PublicDataBatchService],
})
export class PublicDataModule {}
