import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipeBuilder,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PropertiesService } from './properties.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/v1/properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) { }

  @Get()
  async getProperties() {
    return this.propertiesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('me')
  async getMyProperties(@Request() req: any) {
    return this.propertiesService.findByOwnerId(req.user.id);
  }

  @Get('nearby')
  async getNearbyProperties(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius') radius: number = 5000,
  ) {
    return this.propertiesService.findNearby(
      Number(lat),
      Number(lng),
      Number(radius),
    );
  }

  @Get('map')
  async getPropertiesInBounds(
    @Query('ne') ne: string,
    @Query('sw') sw: string,
  ) {
    const [neLat, neLng] = ne.split(',').map(Number);
    const [swLat, swLng] = sw.split(',').map(Number);
    return this.propertiesService.findInBounds(neLat, neLng, swLat, swLng);
  }

  @Get(':id')
  async getProperty(@Param('id') id: string) {
    return this.propertiesService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'beforeImage', maxCount: 1 },
      { name: 'afterImage', maxCount: 1 },
    ]),
  )
  async createProperty(
    @UploadedFiles()
    files: {
      beforeImage?: Express.Multer.File[];
      afterImage?: Express.Multer.File[];
    },
    @Body() body: any,
    @Request() req: any,
  ) {
    // body requires: title, description, address, price, lat, lng
    const data = {
      ...body,
      ownerId: req.user?.id,
    };
    return this.propertiesService.createProperty(data, files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'beforeImage', maxCount: 1 },
      { name: 'afterImage', maxCount: 1 },
    ]),
  )
  async updateProperty(
    @Param('id') id: string,
    @UploadedFiles()
    files: {
      beforeImage?: Express.Multer.File[];
      afterImage?: Express.Multer.File[];
    },
    @Body() body: any,
  ) {
    return this.propertiesService.updateProperty(id, body, files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  async deleteProperty(@Param('id') id: string) {
    return this.propertiesService.deleteProperty(id);
  }
}
