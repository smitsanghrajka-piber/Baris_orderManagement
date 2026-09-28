import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrincipalService } from './principal.service';
import { AuthUser, JwtClaims } from './auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly principals: PrincipalService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtClaims): Promise<AuthUser> {
    if (!payload?.sub || (payload.kind !== 'STAFF' && payload.kind !== 'CUSTOMER')) {
      throw new (await import('../errors/domain-error')).UnauthorizedError('Invalid token.');
    }
    return this.principals.resolve(payload);
  }
}
