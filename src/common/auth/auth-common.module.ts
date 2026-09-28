import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { PrincipalService } from './principal.service';

/** Strategy + principal resolver, shared by every module and the global guards. */
@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, PrincipalService],
  exports: [PrincipalService, PassportModule],
})
export class AuthCommonModule {}
