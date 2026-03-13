import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
export declare class AuthService {
    private usersService;
    private jwtService;
    constructor(usersService: UsersService, jwtService: JwtService);
    validateSocialUser(provider: string, providerId: string, email: string, name: string): Promise<any>;
    generateJwtCookiePayload(user: any): Promise<string>;
}
