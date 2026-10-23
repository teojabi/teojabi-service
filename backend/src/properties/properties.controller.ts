import {
  BadRequestException,
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
    const latNumber = Number(lat);
    const lngNumber = Number(lng);
    const radiusNumber = Number(radius);
    if (
      !Number.isFinite(latNumber) ||
      !Number.isFinite(lngNumber) ||
      !Number.isFinite(radiusNumber) ||
      Math.abs(latNumber) > 90 ||
      Math.abs(lngNumber) > 180 ||
      radiusNumber <= 0 ||
      radiusNumber > 20000
    ) {
      throw new BadRequestException('잘못된 좌표 또는 반경입니다.');
    }
    return this.propertiesService.findNearby(latNumber, lngNumber, radiusNumber);
  }

  @Get('map')
  async getPropertiesInBounds(
    @Query('ne') ne: string,
    @Query('sw') sw: string,
  ) {
    const neParts = String(ne ?? '').split(',').map(Number);
    const swParts = String(sw ?? '').split(',').map(Number);
    if (
      neParts.length !== 2 ||
      swParts.length !== 2 ||
      ![...neParts, ...swParts].every(Number.isFinite) ||
      Math.abs(neParts[0]) > 90 ||
      Math.abs(swParts[0]) > 90 ||
      Math.abs(neParts[1]) > 180 ||
      Math.abs(swParts[1]) > 180
    ) {
      throw new BadRequestException('잘못된 지도 범위입니다.');
    }
    const [neLat, neLng] = neParts;
    const [swLat, swLng] = swParts;
    return this.propertiesService.findInBounds(neLat, neLng, swLat, swLng);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getProperty(@Param('id') id: string) {
    return this.propertiesService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'beforeImage', maxCount: 1 },
        { name: 'afterImage', maxCount: 1 },
      ],
      {
        limits: { fileSize: 8 * 1024 * 1024, files: 2 },
        fileFilter: (_req, file, callback) => {
          const allowed = /^image\/(?:png|jpe?g|webp)$/i.test(file.mimetype);
          callback(
            allowed ? null : new BadRequestException('이미지 파일만 업로드할 수 있습니다.'),
            allowed,
          );
        },
      },
    ),
  )
  async createProperty(
    @UploadedFiles()
    files: {
      beforeImage?: any[];
      afterImage?: any[];
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
    FileFieldsInterceptor(
      [
        { name: 'beforeImage', maxCount: 1 },
        { name: 'afterImage', maxCount: 1 },
      ],
      {
        limits: { fileSize: 8 * 1024 * 1024, files: 2 },
        fileFilter: (_req, file, callback) => {
          const allowed = /^image\/(?:png|jpe?g|webp)$/i.test(file.mimetype);
          callback(
            allowed ? null : new BadRequestException('이미지 파일만 업로드할 수 있습니다.'),
            allowed,
          );
        },
      },
    ),
  )
  async updateProperty(
    @Param('id') id: string,
    @UploadedFiles()
    files: {
      beforeImage?: any[];
      afterImage?: any[];
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
