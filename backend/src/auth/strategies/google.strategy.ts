import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') as string,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') as string,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') as string,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const providerIdRaw = profile?.id ?? profile?._json?.id;
    const providerId = providerIdRaw ? String(providerIdRaw) : '';
    const email =
      profile.emails && profile.emails.length > 0
        ? profile.emails[0].value
        : null;
    const name =
      profile.displayName ||
      profile.name?.givenName ||
      profile._json?.name ||
      '구글유저';

    this.logger.log(
      `구글 소셜 로그인 원본 응답 데이터: ${JSON.stringify(profile?._json ?? profile)}`,
    );

    const socialPayload = this.authService.buildSocialAuthPayload(
      'google',
      providerId,
      email,
      name,
    );
    done(null, socialPayload);
  }
}
