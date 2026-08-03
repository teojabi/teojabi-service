import { of } from 'rxjs';
import { PublicDataService } from './public-data.service';

describe('PublicDataService', () => {
  let service: PublicDataService;
  let httpService: { post: jest.Mock };
  let prismaService: { $transaction: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    httpService = { post: jest.fn() };
    prismaService = { $transaction: jest.fn() };
    configService = { get: jest.fn() };

    service = new PublicDataService(
      httpService as any,
      prismaService as any,
      configService as any,
    );
  });

  it('AI 키가 없으면 실패 처리하고 차감된 크레딧을 환원한다', async () => {
    const consumedCredit = {
      totalCredits: 10,
      usedCredits: 3,
      availableCredits: 7,
    };
    const restoredCredit = {
      totalCredits: 10,
      usedCredits: 2,
      availableCredits: 8,
    };

    jest
      .spyOn(service as any, 'consumeCreditForAiRequest')
      .mockResolvedValue(consumedCredit);
    const refundSpy = jest
      .spyOn(service as any, 'refundCreditForAiRequest')
      .mockResolvedValue(restoredCredit);
    configService.get.mockReturnValue(undefined);

    const result = await service.getAiNewbuildAnalysis(
      '1111010100100010000',
      'user-1',
    );

    expect(result).toEqual({
      success: false,
      message: 'AI 분석 키가 설정되지 않아 결과를 생성할 수 없습니다.',
      credit: restoredCredit,
    });
    expect(refundSpy).toHaveBeenCalledWith('user-1');
  });

  it('Gemini 응답이 비어 있으면 실패 처리하고 차감된 크레딧을 환원한다', async () => {
    const consumedCredit = {
      totalCredits: 10,
      usedCredits: 5,
      availableCredits: 5,
    };
    const restoredCredit = {
      totalCredits: 10,
      usedCredits: 4,
      availableCredits: 6,
    };

    jest
      .spyOn(service as any, 'consumeCreditForAiRequest')
      .mockResolvedValue(consumedCredit);
    const refundSpy = jest
      .spyOn(service as any, 'refundCreditForAiRequest')
      .mockResolvedValue(restoredCredit);
    jest.spyOn(service, 'getLocationInfo').mockResolvedValue({
      building: {},
      land: {},
      floorStatuses: [],
      stores: [],
    });
    configService.get.mockReturnValue('test-gemini-key');
    httpService.post.mockReturnValue(
      of({
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: '   ' }],
              },
            },
          ],
        },
      }),
    );

    const result = await service.getAiNewbuildAnalysis(
      '1111010100100010000',
      'user-2',
    );

    expect(result).toEqual({
      success: false,
      message: 'AI 분석 결과가 비어 있습니다. 잠시 후 다시 시도해 주세요.',
      credit: restoredCredit,
    });
    expect(refundSpy).toHaveBeenCalledWith('user-2');
  });

  it('Gemini 요약이 정상일 때는 성공 처리하고 환원하지 않는다', async () => {
    const consumedCredit = {
      totalCredits: 10,
      usedCredits: 6,
      availableCredits: 4,
    };

    jest
      .spyOn(service as any, 'consumeCreditForAiRequest')
      .mockResolvedValue(consumedCredit);
    const refundSpy = jest
      .spyOn(service as any, 'refundCreditForAiRequest')
      .mockResolvedValue(null);
    jest.spyOn(service, 'getLocationInfo').mockResolvedValue({
      building: {},
      land: {},
      floorStatuses: [],
      stores: [],
    });
    configService.get.mockReturnValue('test-gemini-key');
    httpService.post.mockReturnValue(
      of({
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: '정상 요약 결과' }],
              },
            },
          ],
        },
      }),
    );

    const result = await service.getAiNewbuildAnalysis(
      '1111010100100010000',
      'user-3',
    );

    expect(result).toEqual({
      success: true,
      data: { summary: '정상 요약 결과' },
      credit: consumedCredit,
    });
    expect(refundSpy).not.toHaveBeenCalled();
  });
});
