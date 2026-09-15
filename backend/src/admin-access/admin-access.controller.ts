import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminAccessService } from './admin-access.service';

class AddAdminDto {
  @IsEmail()
  email!: string;
}

@Controller('api/v1/admin-access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAccessController {
  constructor(private readonly service: AdminAccessService) {}

  @Get('me')
  me(@Request() req: any) { return this.service.getMyAccess(req.user.id); }

  @Get('members')
  members(@Request() req: any) { return this.service.listMembers(req.user.id); }

  @Post('members')
  add(@Request() req: any, @Body() body: AddAdminDto) { return this.service.addAdmin(req.user.id, body.email); }

  @Delete('members/:userId')
  remove(@Request() req: any, @Param('userId') userId: string) { return this.service.removeAdmin(req.user.id, userId); }
}
