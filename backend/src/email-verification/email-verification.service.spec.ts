import { Test, TestingModule } from '@nestjs/testing';
import { EmailVerificationService } from './email-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let prismaMock: any;
  let configMap: Record<string, string | undefined>;
  const axiosPostMock = axios.post as jest.Mock;

  beforeEach(async () => {
    axiosPostMock.mockResolvedValue({
      status: 202,
      data: {},
    });

    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      emailVerificationToken: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) =>
        fn({
          user: prismaMock.user,
          emailVerificationToken: prismaMock.emailVerificationToken,
        }),
      ),
    };

    configMap = {
      BACKEND_PUBLIC_URL: 'http://localhost:3000',
      NCLOUD_MAIL_BASE_URL: 'https://mail.apigw.ntruss.com',
      NCLOUD_ACCESS_KEY: 'ncp-access-key',
      NCLOUD_SECRET_KEY: 'ncp-secret-key',
      NCLOUD_MAIL_SENDER_ADDRESS: 'noreply@example.com',
      NCLOUD_MAIL_SENDER_NAME: '터잡이',
      PORT: '3001',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => configMap[key],
          },
        },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('인증 메일 발송 시 user.email을 사용해 토큰을 저장한다', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      emailVerified: false,
      lastVerificationSentAt: null,
    });

    const result = await service.sendVerificationLink('user-1', {
      requestIp: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(result.success).toBe(true);
    expect(prismaMock.emailVerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          email: 'user@test.com',
          purpose: 'REPORT_DELIVERY_VERIFICATION',
        }),
      }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
      }),
    );
    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://mail.apigw.ntruss.com/api/v1/mails',
      expect.objectContaining({
        senderAddress: 'noreply@example.com',
        confirmAndSend: false,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-ncp-iam-access-key': 'ncp-access-key',
        }),
      }),
    );
  });

  it('재발송 쿨다운(60초) 내 요청은 거부한다', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      emailVerified: false,
      lastVerificationSentAt: new Date(),
    });

    await expect(
      service.sendVerificationLink('user-1', {
        requestIp: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toHaveProperty('status', HttpStatus.TOO_MANY_REQUESTS);
  });

  it('만료된 토큰은 인증에 실패한다', async () => {
    prismaMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      user: { id: 'user-1' },
    });

    await expect(
      service.confirmVerificationToken('expired-token'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('비로컬 환경에서 BACKEND_PUBLIC_URL 미설정 시 api.teojabi.com 인증 링크를 사용한다', async () => {
    configMap.BACKEND_PUBLIC_URL = undefined;
    configMap.BACKEND_URL = undefined;
    configMap.NODE_ENV = 'production';

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      emailVerified: false,
      lastVerificationSentAt: null,
    });

    await service.sendVerificationLink('user-1', {
      requestIp: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://mail.apigw.ntruss.com/api/v1/mails',
      expect.objectContaining({
        body: expect.stringContaining('https://api.teojabi.com/api/v1/email-verification/confirm?token='),
      }),
      expect.any(Object),
    );
  });
});
