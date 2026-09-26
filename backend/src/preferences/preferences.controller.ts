import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PreferencesService } from './preferences.service';

@Controller('api/v1/preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  // 내 관심 프로필. 저장돼 있으면 그대로, 없으면 한 번 계산해 돌려준다.
  @Get('me')
  async me(@Request() req: any) {
    const existing = await this.preferences.get(req.user.id);
    return existing ?? this.preferences.rebuild(req.user.id);
  }
}
