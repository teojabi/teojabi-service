import { Strategy } from 'passport-kakao';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
declare const KakaoStrategy_base: new (...args: [options: import("passport-kakao").StrategyOption] | [options: import("passport-kakao").StrategyOptionWithRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class KakaoStrategy extends KakaoStrategy_base {
    private configService;
    private authService;
    constructor(configService: ConfigService, authService: AuthService);
    validate(accessToken: string, refreshToken: string, profile: any, done: any): Promise<void>;
}
export {};
