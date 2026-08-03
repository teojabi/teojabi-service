import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async getSetting(key: string) {
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
    return this.prisma.setting.findMany();
  }
}
