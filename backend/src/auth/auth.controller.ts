import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    async login(@Body() body: { provider: string; providerId: string }) {
        const user = await this.authService.validateUser(body.provider, body.providerId);
        return this.authService.login(user);
    }
}
