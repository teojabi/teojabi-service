import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-naver';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import axios from 'axios';

@Injectable()
export class NaverStrategy extends PassportStrategy(Strategy, 'naver') {
  private readonly logger = new Logger(NaverStrategy.name);
  private static readonly NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';

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
    let resolvedProfile = profile;

    if (this.shouldRefetchProfile(profile)) {
      this.logger.warn('네이버 프로필 핵심 정보가 비어 있어 프로필 재조회 시도');
      const refetchedProfile = await this.fetchProfileFromNaver(accessToken);
      if (refetchedProfile) {
        resolvedProfile = this.mergeProfiles(profile, refetchedProfile);
      }
    }

    const providerIdRaw =
      resolvedProfile?.id ??
      resolvedProfile?._json?.id ??
      resolvedProfile?._json?.response?.id;
    const providerId = providerIdRaw ? String(providerIdRaw) : '';
    const email =
      resolvedProfile.emails && resolvedProfile.emails.length > 0
        ? resolvedProfile.emails[0].value
        : resolvedProfile._json?.response?.email || null;
    const name =
      resolvedProfile.displayName ||
      resolvedProfile.username ||
      resolvedProfile._json?.name ||
      resolvedProfile._json?.nickname ||
      resolvedProfile._json?.response?.name ||
      resolvedProfile._json?.response?.nickname ||
      '네이버유저';

    this.logger.log(
      `네이버 소셜 로그인 원본 응답 데이터: ${JSON.stringify(resolvedProfile?._json ?? resolvedProfile)}`,
    );

    const socialPayload = this.authService.buildSocialAuthPayload(
      'naver',
      providerId,
      email,
      name,
    );
    done(null, socialPayload);
  }

  private shouldRefetchProfile(profile: any): boolean {
    const providerId = profile?.id ?? profile?._json?.id ?? profile?._json?.response?.id;
    const email =
      profile?.emails && profile.emails.length > 0
        ? profile.emails[0]?.value
        : profile?._json?.response?.email;
    const name =
      profile?.displayName ||
      profile?.username ||
      profile?._json?.name ||
      profile?._json?.nickname ||
      profile?._json?.response?.name ||
      profile?._json?.response?.nickname;

    return !providerId || !email || !name;
  }

  private async fetchProfileFromNaver(accessToken: string): Promise<any | null> {
    try {
      const response = await axios.get(NaverStrategy.NAVER_PROFILE_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      this.logger.log(
        `네이버 프로필 재조회 응답 데이터: ${JSON.stringify(response.data)}`,
      );

      const raw = response.data?.response;
      if (!raw?.id) {
        this.logger.warn(
          `네이버 프로필 재조회 응답에 id가 없습니다: ${JSON.stringify(response.data)}`,
        );
        return null;
      }

      return {
        id: raw.id,
        displayName: raw.name || raw.nickname,
        username: raw.nickname,
        emails: raw.email ? [{ value: raw.email }] : [],
        _json: {
          ...response.data,
          name: raw.name,
          nickname: raw.nickname,
          response: raw,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`네이버 프로필 재조회 실패: ${message}`);
      return null;
    }
  }

  private mergeProfiles(originalProfile: any, refetchedProfile: any): any {
    return {
      ...originalProfile,
      ...refetchedProfile,
      _json: {
        ...(originalProfile?._json ?? {}),
        ...(refetchedProfile?._json ?? {}),
      },
      emails:
        (refetchedProfile?.emails?.length ?? 0) > 0
          ? refetchedProfile.emails
          : originalProfile?.emails ?? [],
    };
  }
}
