import { Controller, Post, Get, Param, UseGuards, Request } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('me')
  async getMyFavorites(@Request() req: any) {
    return this.favoritesService.getMyFavorites(req.user.id);
  }

  @Get('check/:propertyId')
  async checkFavorite(@Request() req: any, @Param('propertyId') propertyId: string) {
    return this.favoritesService.checkFavorite(req.user.id, propertyId);
  }

  @Post(':propertyId')
  async toggleFavorite(@Request() req: any, @Param('propertyId') propertyId: string) {
    return this.favoritesService.toggleFavorite(req.user.id, propertyId);
  }
}
