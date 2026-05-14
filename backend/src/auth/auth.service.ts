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
    let isNewUser = false;
    if (!user) {
      // Create user if not exists
      user = await this.usersService.createSocialUser(
        provider,
        providerId,
        email,
        name,
      );
      isNewUser = true;
    }

    await this.usersService.ensureDefaultCreditWallet(user.id);

    return { id: user.id, email: user.email, name: user.name, role: user.role, isNewUser };
  }

  async generateJwtCookiePayload(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return this.jwtService.sign(payload);
  }
}
