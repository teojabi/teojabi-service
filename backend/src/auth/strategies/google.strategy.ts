import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
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

    async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
        const providerId = String(profile.id);
        const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
        const name = profile.displayName || profile.name?.givenName || profile._json?.name || '구글 유저';

        // Auth Service를 통해 유저 검증 또는 생성
        const user = await this.authService.validateSocialUser('google', providerId, email, name);
        done(null, user);
    }
}
