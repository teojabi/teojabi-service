import { Request, Response } from 'express';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    mockLogin(res: Response): Promise<void>;
    kakaoAuth(): Promise<void>;
    kakaoAuthCallback(req: Request, res: Response): Promise<void>;
    naverAuth(): Promise<void>;
    naverAuthCallback(req: Request, res: Response): Promise<void>;
    googleAuth(): Promise<void>;
    googleAuthCallback(req: Request, res: Response): Promise<void>;
    logout(res: Response): Promise<Response<any, Record<string, any>>>;
}
