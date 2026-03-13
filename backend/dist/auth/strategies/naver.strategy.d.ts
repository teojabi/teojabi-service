import { Strategy } from 'passport-naver';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
declare const NaverStrategy_base: new (...args: [options: import("passport-naver").StrategyOption] | [options: import("passport-naver").StrategyOptionWithRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class NaverStrategy extends NaverStrategy_base {
    private configService;
    private authService;
    constructor(configService: ConfigService, authService: AuthService);
    validate(accessToken: string, refreshToken: string, profile: any, done: any): Promise<void>;
}
export {};
