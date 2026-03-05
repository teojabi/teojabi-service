import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/reservations')
export class ReservationsController {
    constructor(private readonly reservationsService: ReservationsService) { }

    @UseGuards(JwtAuthGuard)
    @Post()
    async createReservation(@Request() req: any, @Body() body: any) {
        return this.reservationsService.create(req.user.id, body);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    async getMyReservations(@Request() req: any) {
        return this.reservationsService.findAllForUser(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Patch(':id/status')
    async updateStatus(@Param('id') id: string, @Body('status') status: any) {
        return this.reservationsService.updateStatus(id, status);
    }
}
