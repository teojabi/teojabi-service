import { Controller, Get, Req, Res, UseGuards, Post } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Get('mock-login')
    async mockLogin(@Res() res: Response) {
        // 테스트 환경용 임시 ADMIN 로그인 (실제 배포 시 제거 필요)
        let testUser = await this.authService.validateSocialUser('mock', 'admin', 'admin@teojabi.com', '터잡이관리자');

        // 강제로 ADMIN 권한 부여 (로컬 테스트용)
        testUser.role = 'ADMIN';

        const token = await this.authService.generateJwtCookiePayload(testUser);
        res.cookie('access_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24, // 1 day
        });
        return res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
    }

    @Get('kakao')
    @UseGuards(AuthGuard('kakao'))
    async kakaoAuth() {
        // Redirects to Kakao
    }

    @Get('kakao/callback')
    @UseGuards(AuthGuard('kakao'))
    async kakaoAuthCallback(@Req() req: Request, @Res() res: Response) {
        const token = await this.authService.generateJwtCookiePayload(req.user);
        res.cookie('access_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24, // 1 day
        });
        // 프론트엔드 메인 홈페이지로 리다이렉트
        return res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
    }

    @Get('naver')
    @UseGuards(AuthGuard('naver'))
    async naverAuth() {
        // Redirects to Naver
    }

    @Get('naver/callback')
    @UseGuards(AuthGuard('naver'))
    async naverAuthCallback(@Req() req: Request, @Res() res: Response) {
        const token = await this.authService.generateJwtCookiePayload(req.user);
        res.cookie('access_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24, // 1 day
        });
        // 프론트엔드 메인 홈페이지로 리다이렉트
        return res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
    }

    @Get('google')
    @UseGuards(AuthGuard('google'))
    async googleAuth() {
        // Redirects to Google
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
        const token = await this.authService.generateJwtCookiePayload(req.user);
        res.cookie('access_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24, // 1 day
        });
        // 프론트엔드 메인 홈페이지로 리다이렉트
        return res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
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
