import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 인증 없이 공개해도 되는 설정 키만 노출한다. (내부 키·비밀값 유출 방지)
const PUBLIC_SETTING_KEYS = ['sample_report_url'];
const PUBLIC_SETTING_PREFIX = 'public_';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // 초기 설정 데이터 삽입 (없을 경우에만)
    await this.ensureSetting('sample_report_url', 'https://teojabi.com/samples/sample_report.pdf');
  }

  private async ensureSetting(key: string, defaultValue: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) {
      await this.prisma.setting.create({
        data: { key, value: defaultValue },
      });
    }
  }

  private isPublicSetting(key: string) {
    return PUBLIC_SETTING_KEYS.includes(key) || key.startsWith(PUBLIC_SETTING_PREFIX);
  }

  async getSetting(key: string) {
    if (!this.isPublicSetting(key)) return null;
    return this.prisma.setting.findUnique({
      where: { key },
    });
  }

  async updateSetting(key: string, value: string) {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getAllSettings() {
    return this.prisma.setting.findMany({
      where: {
        OR: [
          { key: { in: PUBLIC_SETTING_KEYS } },
          { key: { startsWith: PUBLIC_SETTING_PREFIX } },
        ],
      },
    });
  }
}
