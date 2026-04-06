import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-kakao';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class KakaoStrategy extends PassportStrategy(Strategy, 'kakao') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('KAKAO_CLIENT_ID') as string,
      clientSecret: configService.get<string>('KAKAO_CLIENT_SECRET') as string,
      callbackURL: configService.get<string>('KAKAO_CALLBACK_URL') as string,
      scope: ['account_email', 'profile_nickname'],
    } as any);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: any,
  ) {
    const providerId = String(profile.id);
    const email = profile._json?.kakao_account?.email || null;
    const name =
      profile.displayName ||
      profile.username ||
      profile._json?.properties?.nickname ||
      profile._json?.kakao_account?.profile?.nickname ||
      '카카오유저';

    // Auth Service를 통해 유저 검증 또는 생성
    const user = await this.authService.validateSocialUser(
      'kakao',
      providerId,
      email,
      name,
    );
    done(null, user);
  }
}
