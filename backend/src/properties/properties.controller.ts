import { Controller, Get, Post, Body, Param, Query, UseInterceptors, UploadedFile, ParseFilePipeBuilder, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

    @Post()
    @UseInterceptors(FileInterceptor('image'))
    async createProperty(
        @UploadedFile(
            new ParseFilePipeBuilder()
                .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
                .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5MB
                .build({
                    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                    fileIsRequired: false,
                }),
        )
        file: Express.Multer.File,
        @Body() body: any,
    ) {
        // body requires: title, description, address, price, lat, lng, ownerId(optional)
        return this.propertiesService.createProperty(body, file);
    }
}
