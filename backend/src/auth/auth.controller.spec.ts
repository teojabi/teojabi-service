import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    findExistingSocialUser: jest.Mock;
    generateJwtCookiePayload: jest.Mock;
    generatePendingSocialSignupToken: jest.Mock;
    verifyPendingSocialSignupToken: jest.Mock;
    completeSocialSignup: jest.Mock;
  };

  const createResponse = () => {
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
      json: jest.fn(),
    };
    return res as any;
  };

  beforeEach(async () => {
    authService = {
      findExistingSocialUser: jest.fn(),
      generateJwtCookiePayload: jest.fn(),
      generatePendingSocialSignupToken: jest.fn(),
      verifyPendingSocialSignupToken: jest.fn(),
      completeSocialSignup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('기존 소셜 사용자는 콜백에서 즉시 로그인 쿠키를 발급한다', async () => {
    const req = {
      user: {
        provider: 'naver',
        providerId: 'naver-1',
        email: 'a@test.com',
        name: '기존유저',
      },
    } as any;
    const res = createResponse();

    authService.findExistingSocialUser.mockResolvedValue({
      id: 'user-1',
      role: 'USER',
      isNewUser: false,
    });
    authService.generateJwtCookiePayload.mockResolvedValue('jwt-token');

    await controller.naverAuthCallback(req, res);

    expect(authService.findExistingSocialUser).toHaveBeenCalledWith('naver', 'naver-1');
    expect(res.cookie).toHaveBeenCalledWith(
      'access_token',
      'jwt-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/mypage.html'));
  });

  it('신규 소셜 사용자는 pending-signup 토큰 발급 후 메인으로 이동한다', async () => {
    const req = {
      user: {
        provider: 'kakao',
        providerId: 'kakao-2',
        email: 'b@test.com',
        name: '신규유저',
      },
    } as any;
    const res = createResponse();

    authService.findExistingSocialUser.mockResolvedValue(null);
    authService.generatePendingSocialSignupToken.mockReturnValue('pending-token');

    await controller.kakaoAuthCallback(req, res);

    expect(authService.completeSocialSignup).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(
      'pending_signup_token',
      'pending-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'pending_signup_provider',
      'kakao',
      expect.objectContaining({ httpOnly: true }),
    );
    const redirectUrl = res.redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toBe('http://localhost:3000/');
  });

  it('pending-signup-status는 유효한 토큰이면 약관 모달 표시 상태를 반환한다', async () => {
    const req = {
      cookies: {
        pending_signup_token: 'token',
        pending_signup_provider: 'naver',
      },
    } as any;
    const res = createResponse();

    authService.verifyPendingSocialSignupToken.mockReturnValue({
      provider: 'naver',
      providerId: 'naver-99',
      email: 'naver@test.com',
      name: '네이버유저',
    });

    await controller.getPendingSignupStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresConsent: true,
        provider: 'naver',
        providerId: 'naver-99',
      }),
    );
  });

  it('complete-signup은 약관 미동의 시 실패한다', async () => {
    const req = { cookies: { pending_signup_token: 'token' } } as any;
    const res = createResponse();

    await expect(
      controller.completeSocialSignup(
        {
          agreeTerms: true,
          agreeCollect: false,
        },
        req,
        res,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('complete-signup은 토큰 검증 후 사용자 생성/로그인을 완료한다', async () => {
    const req = {
      cookies: {
        pending_signup_token: 'token',
        pending_signup_provider: 'google',
      },
    } as any;
    const res = createResponse();

    authService.verifyPendingSocialSignupToken.mockReturnValue({
      provider: 'google',
      providerId: 'google-3',
      email: 'c@test.com',
      name: '가입유저',
    });
    authService.completeSocialSignup.mockResolvedValue({
      id: 'user-3',
      isNewUser: true,
      role: 'USER',
    });
    authService.generateJwtCookiePayload.mockResolvedValue('jwt-token');

    await controller.completeSocialSignup(
      {
        agreeTerms: true,
        agreeCollect: true,
      },
      req,
      res,
    );

    expect(authService.completeSocialSignup).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', providerId: 'google-3' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'access_token',
      'jwt-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'pending_signup_token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, redirectUrl: '/mypage.html?newUser=1' }),
    );
  });
});
