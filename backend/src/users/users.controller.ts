import { Controller, Get, Patch, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { UsersService, UpdateUserDto } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateProfile(@Request() req: any, @Body() body: UpdateUserDto) {
    const { name, email, phone } = body;
    if (email !== undefined && !email) {
      throw new BadRequestException('이메일은 비워둘 수 없습니다.');
    }
    const dto: UpdateUserDto = {};
    if (name !== undefined) dto.name = name;
    if (email !== undefined) dto.email = email;
    if (phone !== undefined) dto.phone = phone;
    return this.usersService.updateUser(req.user.id, dto);
  }
}
