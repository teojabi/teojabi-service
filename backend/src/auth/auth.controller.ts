import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Req,
  Res,
  UseGuards,
  Post,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService, SocialAuthPayload } from './auth.service';

interface CompleteSocialSignupDto {
  provider?: string;
  signupToken?: string;
  agreeTerms: boolean;
  agreeCollect: boolean;
}

@Controller('api/v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  private getAuthCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite: 'none' | 'lax' = isProd ? 'none' : 'lax';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite,
      maxAge: 1000 * 60 * 60 * 24,
    };
  }

  private buildRedirectUrl(user: any, frontendUrl: string) {
    if (user.role === 'ADMIN') {
      return `${frontendUrl}/admin.html`;
    }

    if (user.isNewUser) {
      return `${frontendUrl}/`;
    }

    return `${frontendUrl}/mypage.html`;
  }

  @Get('mock-login')
  async mockLogin(@Res() res: Response) {
    // 테스트 환경용 임시 ADMIN 로그인 (실제 배포 시 제거 필요)
    let testUser = await this.authService.findExistingSocialUser('mock', 'admin');
    if (!testUser) {
      testUser = await this.authService.completeSocialSignup({
        provider: 'mock',
        providerId: 'admin',
        email: 'admin@teojabi.com',
        name: '터잡이관리자',
      });
    }

    // 강제로 ADMIN 권한 부여 (로컬 테스트용)
    testUser.role = 'ADMIN';

    const token = await this.authService.generateJwtCookiePayload(testUser);
    res.cookie('access_token', token, this.getAuthCookieOptions());

    // 역할에 따른 리다이렉트 분기
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl =
      testUser.role === 'ADMIN'
        ? `${frontendUrl}/admin.html`
        : `${frontendUrl}/mypage.html`;
    return res.redirect(redirectUrl);
  }

  @Get('kakao')
  @UseGuards(AuthGuard('kakao'))
  async kakaoAuth() {
    // Redirects to Kakao
  }

  @Get('kakao/callback')
  @UseGuards(AuthGuard('kakao'))
  async kakaoAuthCallback(@Req() req: Request, @Res() res: Response) {
    const socialPayload = req.user as SocialAuthPayload;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.handleSocialCallback(socialPayload, 'kakao', frontendUrl, res);
  }

  @Get('naver')
  @UseGuards(AuthGuard('naver'))
  async naverAuth() {
    // Redirects to Naver
  }

  @Get('naver/callback')
  @UseGuards(AuthGuard('naver'))
  async naverAuthCallback(@Req() req: Request, @Res() res: Response) {
    const socialPayload = req.user as SocialAuthPayload;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.handleSocialCallback(socialPayload, 'naver', frontendUrl, res);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const socialPayload = req.user as SocialAuthPayload;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.handleSocialCallback(socialPayload, 'google', frontendUrl, res);
  }

  @Get('social/pending-signup-status')
  async getPendingSignupStatus(@Req() req: Request, @Res() res: Response) {
    const signupToken = req.cookies?.pending_signup_token;
    const requestProvider = req.cookies?.pending_signup_provider;

    if (!signupToken) {
      return res.json({ requiresConsent: false });
    }

    try {
      const payload = this.authService.verifyPendingSocialSignupToken(signupToken);

      if (requestProvider && payload.provider !== requestProvider) {
        this.logger.warn(
          `[social-signup] pending-signup-status 실패 - provider 불일치 cookieProvider=${requestProvider}, tokenProvider=${payload.provider}`,
        );
        res.clearCookie('pending_signup_token', this.getAuthCookieOptions());
        res.clearCookie('pending_signup_provider', this.getAuthCookieOptions());
        return res.json({ requiresConsent: false });
      }

      return res.json({
        requiresConsent: true,
        provider: payload.provider,
        providerId: payload.providerId,
        email: payload.email,
        name: payload.name,
      });
    } catch {
      this.logger.warn('[social-signup] pending-signup-status 실패 - signupToken 검증 실패');
      res.clearCookie('pending_signup_token', this.getAuthCookieOptions());
      res.clearCookie('pending_signup_provider', this.getAuthCookieOptions());
      return res.json({ requiresConsent: false });
    }
  }

  @Post('social/complete-signup')
  async completeSocialSignup(
    @Body() body: CompleteSocialSignupDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const requestProvider = body.provider ?? req.cookies?.pending_signup_provider;
    const signupToken = body.signupToken ?? req.cookies?.pending_signup_token;
    const { agreeTerms, agreeCollect } = body;

    this.logger.log(
      `[social-signup] complete-signup 요청 수신 provider=${requestProvider ?? 'null'}, hasSignupToken=${Boolean(signupToken)}, agreeTerms=${Boolean(agreeTerms)}, agreeCollect=${Boolean(agreeCollect)}`,
    );

    if (!signupToken) {
      this.logger.warn('[social-signup] complete-signup 실패 - signupToken 누락');
      throw new BadRequestException('회원가입 요청 정보가 올바르지 않습니다.');
    }

    if (!agreeTerms || !agreeCollect) {
      this.logger.warn('[social-signup] complete-signup 실패 - 필수 약관 미동의');
      throw new BadRequestException('필수 약관 동의가 필요합니다.');
    }

    let payload: SocialAuthPayload;
    try {
      payload = this.authService.verifyPendingSocialSignupToken(signupToken);
    } catch {
      this.logger.warn('[social-signup] complete-signup 실패 - signupToken 검증 실패');
      throw new BadRequestException(
        '회원가입 인증 정보가 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.',
      );
    }

    if (requestProvider && payload.provider !== requestProvider) {
      this.logger.warn(
        `[social-signup] complete-signup 실패 - provider 불일치 requestProvider=${requestProvider}, tokenProvider=${payload.provider}`,
      );
      throw new BadRequestException('소셜 제공자 정보가 일치하지 않습니다.');
    }

    let user: any;
    try {
      this.logger.log(
        `[social-signup] completeSocialSignup 호출 provider=${payload.provider}, providerId=${payload.providerId}`,
      );
      user = await this.authService.completeSocialSignup(payload);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'invalid-social-payload'
      ) {
        throw new BadRequestException('소셜 사용자 식별 정보가 올바르지 않습니다. 다시 로그인해 주세요.');
      }

      throw error;
    }

    const token = await this.authService.generateJwtCookiePayload(user);
    res.cookie('access_token', token, this.getAuthCookieOptions());
    res.clearCookie('pending_signup_token', this.getAuthCookieOptions());
    res.clearCookie('pending_signup_provider', this.getAuthCookieOptions());

    this.logger.log(
      `[social-signup] complete-signup 완료 userId=${user.id}, isNewUser=${Boolean(user.isNewUser)}, redirectUrl=/mypage.html?is_new=true`,
    );

    return res.json({
      success: true,
      redirectUrl: '/mypage.html?is_new=true',
    });
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return res.json({ success: true, message: 'Logged out successfully' });
  }

  private async handleSocialCallback(
    socialPayload: SocialAuthPayload,
    provider: string,
    frontendUrl: string,
    res: Response,
  ) {
    this.logger.log(
      `[social-signup] 소셜 콜백 수신 provider=${provider}, payloadProvider=${socialPayload.provider}, providerId=${socialPayload.providerId}`,
    );

    if (!socialPayload.provider || !socialPayload.providerId) {
      this.logger.warn(
        `[social-signup] 소셜 콜백 중단 - 유효하지 않은 식별값 payloadProvider=${socialPayload.provider ?? 'null'}, providerId=${socialPayload.providerId ?? 'null'}`,
      );
      return res.redirect(`${frontendUrl}/?authError=invalid_social_payload`);
    }

    const existingUser = await this.authService.findExistingSocialUser(
      socialPayload.provider,
      socialPayload.providerId,
    );

    if (existingUser) {
      this.logger.log(
        `[social-signup] 기존 사용자 로그인 처리 userId=${existingUser.id}, provider=${socialPayload.provider}, providerId=${socialPayload.providerId}`,
      );
      const token = await this.authService.generateJwtCookiePayload(existingUser);
      res.cookie('access_token', token, this.getAuthCookieOptions());
      const redirectUrl = this.buildRedirectUrl(existingUser, frontendUrl);
      this.logger.log(
        `[social-signup] 기존 사용자 로그인 완료 userId=${existingUser.id}, redirectUrl=${redirectUrl}`,
      );
      return res.redirect(redirectUrl);
    }

    const signupToken = this.authService.generatePendingSocialSignupToken(socialPayload);
    res.cookie('pending_signup_token', signupToken, this.getAuthCookieOptions());
    res.cookie('pending_signup_provider', provider, this.getAuthCookieOptions());
    this.logger.log(
      `[social-signup] 신규 사용자 약관동의 이동 provider=${provider}, providerId=${socialPayload.providerId}`,
    );
    const redirectUrl = `${frontendUrl}/`;
    this.logger.log(
      `[social-signup] pending-signup 토큰 발급 완료 provider=${provider}, providerId=${socialPayload.providerId}, redirectUrl=${redirectUrl}`,
    );
    return res.redirect(redirectUrl);
  }
}
