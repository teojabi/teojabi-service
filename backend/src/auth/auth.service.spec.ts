import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByProvider: jest.Mock;
    findById: jest.Mock;
    ensureDefaultCreditWallet: jest.Mock;
    createSocialUser: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };

  const makeP2002Error = (): Prisma.PrismaClientKnownRequestError => {
    const error = new Error('P2002') as Prisma.PrismaClientKnownRequestError;
    (error as any).code = 'P2002';
    Object.setPrototypeOf(error, Prisma.PrismaClientKnownRequestError.prototype);
    return error;
  };

  beforeEach(async () => {
    usersService = {
      findByProvider: jest.fn(),
      findById: jest.fn(),
      ensureDefaultCreditWallet: jest.fn(),
      createSocialUser: jest.fn(),
    };
    jwtService = { sign: jest.fn(), verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('provider+providerId가 유효하지 않으면 회원가입을 중단한다', async () => {
    await expect(
      service.completeSocialSignup({
        provider: 'kakao',
        providerId: 'undefined',
        email: 'a@test.com',
        name: '홍길동',
      }),
    ).rejects.toThrow('invalid-social-payload');
  });

  it('기존 사용자는 create 없이 즉시 반환한다', async () => {
    const existingUser = {
      id: 'user-1',
      email: 'a@test.com',
      name: '기존유저',
      role: 'USER',
    };
    usersService.findByProvider.mockResolvedValue(existingUser);
    usersService.ensureDefaultCreditWallet.mockResolvedValue(undefined);

    const result = await service.completeSocialSignup({
      provider: 'google',
      providerId: 'google-1',
      email: 'a@test.com',
      name: '기존유저',
    });

    expect(usersService.createSocialUser).not.toHaveBeenCalled();
    expect(usersService.ensureDefaultCreditWallet).toHaveBeenCalledWith('user-1');
    expect(result.isNewUser).toBe(false);
  });

  it('신규 사용자는 complete-signup 단계에서 생성한다', async () => {
    const newUser = {
      id: 'user-2',
      email: 'b@test.com',
      name: '신규유저',
      role: 'USER',
    };

    usersService.findByProvider.mockResolvedValueOnce(null);
    usersService.createSocialUser.mockResolvedValue(newUser);
    usersService.ensureDefaultCreditWallet.mockResolvedValue(undefined);

    const result = await service.completeSocialSignup({
      provider: 'naver',
      providerId: 'naver-2',
      email: 'b@test.com',
      name: '신규유저',
    });

    expect(usersService.createSocialUser).toHaveBeenCalledWith(
      'naver',
      'naver-2',
      'b@test.com',
      '신규유저',
    );
    expect(result.isNewUser).toBe(true);
  });

  it('P2002 충돌 시 재조회로 복구한다', async () => {
    const existingUser = {
      id: 'user-3',
      email: 'c@test.com',
      name: '동시가입복구',
      role: 'USER',
    };

    usersService.findByProvider.mockResolvedValueOnce(null).mockResolvedValueOnce(existingUser);
    usersService.createSocialUser.mockRejectedValue(makeP2002Error());
    usersService.ensureDefaultCreditWallet.mockResolvedValue(undefined);

    const result = await service.completeSocialSignup({
      provider: 'kakao',
      providerId: 'kakao-3',
      email: 'c@test.com',
      name: '동시가입복구',
    });

    expect(usersService.findByProvider).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('user-3');
    expect(result.isNewUser).toBe(false);
  });

  it('앱 로그인 코드는 1회만 교환할 수 있다', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@test.com',
      role: 'USER',
    });
    usersService.ensureDefaultCreditWallet.mockResolvedValue(undefined);
    jwtService.sign.mockResolvedValue('jwt-token');

    const code = service.createAppAuthCode('user-1');
    await expect(service.exchangeAppCode(code)).resolves.toEqual({ token: 'jwt-token' });
    await expect(service.exchangeAppCode(code)).rejects.toThrow('유효하지 않은 코드입니다.');
  });

  it('앱 가입 코드는 signupToken과 provider를 반환한다', async () => {
    jwtService.sign.mockReturnValue('signup-token');

    const code = service.createAppSignupCode({
      provider: 'kakao',
      providerId: 'kakao-9',
      email: 'd@test.com',
      name: '가입코드',
    });
    await expect(service.exchangeAppCode(code)).resolves.toEqual({
      signupToken: 'signup-token',
      provider: 'kakao',
    });
  });
});
