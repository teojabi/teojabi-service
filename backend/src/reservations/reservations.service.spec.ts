import { Test, TestingModule } from '@nestjs/testing';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let prismaMock: {
    userSubscription: { findFirst: jest.Mock };
    property: { findUnique: jest.Mock };
    reservation: { create: jest.Mock };
  };

  beforeEach(async () => {
    prismaMock = {
      userSubscription: { findFirst: jest.fn() },
      property: { findUnique: jest.fn() },
      reservation: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('REPORT 신청 시 활성 LIGHT 구독이면 생성 가능하다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue({
      plan: { code: 'light_monthly' },
    });
    prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });

    await expect(
      service.create('user-1', {
        type: 'REPORT',
        pnu: '1111010100100010000',
        date: '2026-05-15T12:00:00.000Z',
        message: '테스트',
      }),
    ).resolves.toEqual({ id: 'reservation-1' });

    expect(prismaMock.userSubscription.findFirst).toHaveBeenCalled();
    expect(prismaMock.reservation.create).toHaveBeenCalled();
  });

  it('REPORT 신청 시 PLUS 계열 구독 코드도 생성 가능하다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue({
      plan: { code: 'plus_monthly' },
    });
    prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-2' });

    await expect(
      service.create('user-1', {
        type: 'REPORT',
        pnu: '1111010100100010000',
        date: '2026-05-15T12:00:00.000Z',
        message: '테스트',
      }),
    ).resolves.toEqual({ id: 'reservation-2' });

    expect(prismaMock.userSubscription.findFirst).toHaveBeenCalled();
    expect(prismaMock.reservation.create).toHaveBeenCalled();
  });

  it('REPORT 신청 시 구독 플랜이 없으면 거부된다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        type: 'REPORT',
        pnu: '1111010100100010000',
        date: '2026-05-15T12:00:00.000Z',
        message: '테스트',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prismaMock.reservation.create).not.toHaveBeenCalled();
  });
});
