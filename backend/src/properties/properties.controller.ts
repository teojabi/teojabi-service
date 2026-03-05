import { Controller, Get, Param, Query } from '@nestjs/common';
import { PropertiesService } from './properties.service';

@Controller('api/v1/properties')
export class PropertiesController {
    constructor(private readonly propertiesService: PropertiesService) { }

    @Get()
    async getProperties() {
        return this.propertiesService.findAll();
    }

    @Get('nearby')
    async getNearbyProperties(
        @Query('lat') lat: number,
        @Query('lng') lng: number,
        @Query('radius') radius: number = 5000,
    ) {
        return this.propertiesService.findNearby(Number(lat), Number(lng), Number(radius));
    }

    @Get(':id')
    async getProperty(@Param('id') id: string) {
        return this.propertiesService.findById(id);
    }
}
