import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Put,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ArchitectsService } from './architects.service';
import { UpdateArchitectStatusDto, UpsertArchitectDto } from './architects.dto';

@Controller('api/v1/architects')
export class ArchitectsController {
  constructor(private readonly architectsService: ArchitectsService) {}

  // 입점 건축사 공개 목록. 로그인 없이 볼 수 있다.
  @Get()
  list() {
    return this.architectsService.listPublic();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return this.architectsService.getMine(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me')
  upsert(@Request() req: any, @Body() body: UpsertArchitectDto) {
    return this.architectsService.upsertMine(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/logo')
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogo(
    @Request() req: any,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /image\/(png|jpe?g|webp)/i })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    file: any,
  ) {
    return this.architectsService.uploadLogo(req.user.id, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/list')
  adminList() {
    return this.architectsService.listAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/:id')
  adminUpdate(@Param('id') id: string, @Body() body: UpdateArchitectStatusDto) {
    return this.architectsService.setStatus(id, body);
  }
}
