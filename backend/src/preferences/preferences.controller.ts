import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PreferencesService } from './preferences.service';

@Controller('api/v1/preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  // 내 관심 프로필을 다시 계산해 돌려준다.
  @Get('me')
  me(@Request() req: any) {
    return this.preferences.rebuild(req.user.id);
  }
}
