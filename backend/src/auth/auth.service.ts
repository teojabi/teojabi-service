import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateSocialUser(
    provider: string,
    providerId: string,
    email: string,
    name: string,
  ): Promise<any> {
    let user = await this.usersService.findByProvider(provider, providerId);
    if (!user && email) {
      // 동일 이메일로 다른 provider로 가입된 계정이 있는지 확인
      user = await this.usersService.findByEmail(email);
    }
    if (!user) {
      // Create user if not exists
      user = await this.usersService.createSocialUser(
        provider,
        providerId,
        email,
        name,
      );
    }

    return user;
  }

  async generateJwtCookiePayload(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return this.jwtService.sign(payload);
  }
}
