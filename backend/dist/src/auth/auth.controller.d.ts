import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(body: {
        provider: string;
        providerId: string;
    }): Promise<{
        access_token: string;
    }>;
}
