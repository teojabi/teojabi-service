import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-naver';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class NaverStrategy extends PassportStrategy(Strategy, 'naver') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('NAVER_CLIENT_ID') as string,
      clientSecret: configService.get<string>('NAVER_CLIENT_SECRET') as string,
      callbackURL: configService.get<string>('NAVER_CALLBACK_URL') as string,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: any,
  ) {
    const providerId = String(profile.id);
    const email =
      profile.emails && profile.emails.length > 0
        ? profile.emails[0].value
        : null;
    const name =
      profile.displayName ||
      profile.username ||
      profile._json?.name ||
      profile._json?.nickname ||
      '네이버 유저';

    // Auth Service를 통해 유저 검증 또는 생성
    const user = await this.authService.validateSocialUser(
      'naver',
      providerId,
      email,
      name,
    );
    done(null, user);
  }
}
