import { Controller, Get, Req, Res, UseGuards, Post } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private buildRedirectUrl(user: any, frontendUrl: string, provider: string) {
    if (user.role === 'ADMIN') {
      return `${frontendUrl}/admin.html`;
    }

    if (user.isNewUser) {
      return `${frontendUrl}/terms-consent.html?provider=${provider}`;
    }

    return `${frontendUrl}/mypage.html`;
  }

  @Get('mock-login')
  async mockLogin(@Res() res: Response) {
    // 테스트 환경용 임시 ADMIN 로그인 (실제 배포 시 제거 필요)
    const testUser = await this.authService.validateSocialUser(
      'mock',
      'admin',
      'admin@teojabi.com',
      '터잡이관리자',
    );

    // 강제로 ADMIN 권한 부여 (로컬 테스트용)
    testUser.role = 'ADMIN';

    const token = await this.authService.generateJwtCookiePayload(testUser);
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    });

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
    const user = req.user as any;
    const token = await this.authService.generateJwtCookiePayload(user);
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    });

    // 역할에 따른 리다이렉트 분기
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = this.buildRedirectUrl(user, frontendUrl, 'kakao');
    return res.redirect(redirectUrl);
  }

  @Get('naver')
  @UseGuards(AuthGuard('naver'))
  async naverAuth() {
    // Redirects to Naver
  }

  @Get('naver/callback')
  @UseGuards(AuthGuard('naver'))
  async naverAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const token = await this.authService.generateJwtCookiePayload(user);
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    });

    // 역할에 따른 리다이렉트 분기
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = this.buildRedirectUrl(user, frontendUrl, 'naver');
    return res.redirect(redirectUrl);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const token = await this.authService.generateJwtCookiePayload(user);
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    });

    // 역할에 따른 리다이렉트 분기
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = this.buildRedirectUrl(user, frontendUrl, 'google');
    return res.redirect(redirectUrl);
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
}
