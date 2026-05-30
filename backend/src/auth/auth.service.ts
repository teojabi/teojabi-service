import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UsersService } from '../users/users.service';

export interface SocialAuthPayload {
  provider: string;
  providerId: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private isInvalidSocialIdentifier(value?: string | null): boolean {
    if (!value) {
      return true;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 || normalized === 'undefined' || normalized === 'null';
  }

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  buildSocialAuthPayload(
    provider: string,
    providerId: string,
    email: string,
    name: string,
  ): SocialAuthPayload {
    const normalizedProvider = provider?.trim();
    const normalizedProviderId = providerId?.trim();

    return {
      provider: normalizedProvider,
      providerId: normalizedProviderId,
      email,
      name,
    };
  }

  async findExistingSocialUser(provider: string, providerId: string): Promise<any | null> {
    if (
      this.isInvalidSocialIdentifier(provider) ||
      this.isInvalidSocialIdentifier(providerId)
    ) {
      this.logger.warn(
        `[social-signup] 기존 사용자 조회 중단 - 유효하지 않은 식별값 provider=${provider ?? 'null'}, providerId=${providerId ?? 'null'}`,
      );
      return null;
    }

    const user = await this.usersService.findByProvider(provider, providerId);
    if (!user) {
      return null;
    }

    await this.usersService.ensureDefaultCreditWallet(user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isNewUser: false,
    };
  }

  async completeSocialSignup(payload: SocialAuthPayload): Promise<any> {
    if (
      this.isInvalidSocialIdentifier(payload.provider) ||
      this.isInvalidSocialIdentifier(payload.providerId)
    ) {
      throw new Error('invalid-social-payload');
    }

    this.logger.log(
      `[social-signup] 회원가입 처리 시작 provider=${payload.provider}, providerId=${payload.providerId}, email=${payload.email ?? 'null'}`,
    );

    let user = await this.usersService.findByProvider(payload.provider, payload.providerId);
    let isNewUser = false;

    if (user) {
      this.logger.log(
        `[social-signup] 기존 사용자 확인으로 저장 생략 userId=${user.id}, provider=${payload.provider}, providerId=${payload.providerId}`,
      );
    }

    if (!user) {
      try {
        this.logger.log(
          `[social-signup] 신규 유저 저장 시작 provider=${payload.provider}, providerId=${payload.providerId}, email=${payload.email ?? 'null'}`,
        );

        user = await this.usersService.createSocialUser(
          payload.provider,
          payload.providerId,
          payload.email,
          payload.name,
        );
        isNewUser = true;

        this.logger.log(
          `[social-signup] 신규 유저 저장 완료 userId=${user.id}, provider=${payload.provider}, providerId=${payload.providerId}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[social-signup] 신규 유저 저장 실패 provider=${payload.provider}, providerId=${payload.providerId}, message=${message}`,
        );

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          this.logger.warn(
            `[social-signup] P2002 충돌 감지 - 기존 사용자 재조회 provider=${payload.provider}, providerId=${payload.providerId}`,
          );
          user = await this.usersService.findByProvider(
            payload.provider,
            payload.providerId,
          );
        }

        if (!user) {
          throw error;
        }
      }
    }

    await this.usersService.ensureDefaultCreditWallet(user.id);

    this.logger.log(
      `[social-signup] 회원가입 처리 완료 userId=${user.id}, isNewUser=${isNewUser}`,
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isNewUser,
    };
  }

  generatePendingSocialSignupToken(payload: SocialAuthPayload): string {
    return this.jwtService.sign(
      {
        type: 'pending-social-signup',
        provider: payload.provider,
        providerId: payload.providerId,
        email: payload.email,
        name: payload.name,
      },
      { expiresIn: '1h' },
    );
  }

  verifyPendingSocialSignupToken(token: string): SocialAuthPayload {
    const decoded = this.jwtService.verify(token) as any;
    if (decoded?.type !== 'pending-social-signup') {
      throw new Error('invalid-signup-token-type');
    }

    return {
      provider: decoded.provider,
      providerId: decoded.providerId,
      email: decoded.email,
      name: decoded.name,
    };
  }

  async generateJwtCookiePayload(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return this.jwtService.sign(payload);
  }
}
