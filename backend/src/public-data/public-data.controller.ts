import { Controller, Get, Query } from '@nestjs/common';
import { PublicDataService } from './public-data.service';

@Controller('api/v1/public-data')
export class PublicDataController {
    constructor(private readonly publicDataService: PublicDataService) { }

    @Get()
    async getPublicData(@Query('address') address: string) {
        if (!address) {
            return { success: false, message: 'Address is required' };
        }
        const data = await this.publicDataService.getPublicData(address);
        return { success: true, data };
    }
}
