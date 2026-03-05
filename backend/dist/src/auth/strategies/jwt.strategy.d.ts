import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly configService;
    private readonly usersService;
    constructor(configService: ConfigService, usersService: UsersService);
    validate(payload: any): Promise<{
        id: string;
        email: string | null;
        name: string | null;
        image: string | null;
        role: import(".prisma/client").$Enums.Role;
        provider: string | null;
        providerId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
export {};
