import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { PublicDataService } from './public-data.service';
import { PublicDataController } from './public-data.controller';

@Module({
    imports: [HttpModule],
    providers: [PublicDataService],
    controllers: [PublicDataController],
    exports: [PublicDataService],
})
export class PublicDataModule { }
