import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('api/v1/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getAllSettings() {
    const settings = await this.settingsService.getAllSettings();
    return { success: true, data: settings };
  }

  @Get(':key')
  async getSetting(@Param('key') key: string) {
    const setting = await this.settingsService.getSetting(key);
    return { success: true, data: setting };
  }

  @Post()
  async updateSetting(@Body() body: { key: string; value: string }) {
    const setting = await this.settingsService.updateSetting(body.key, body.value);
    return { success: true, data: setting };
  }
}
