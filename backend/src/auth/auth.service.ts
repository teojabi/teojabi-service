import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    async validateUser(provider: string, providerId: string): Promise<any> {
        const user = await this.usersService.findByProvider(provider, providerId);
        if (!user) {
            // Create user if not exists (simplified signup for social login)
            return await this.usersService.createUser({ provider, providerId });
        }
        return user;
    }

    async login(user: any) {
        const payload = { email: user.email, sub: user.id, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }
}
