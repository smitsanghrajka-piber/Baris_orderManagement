import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;
export const PASSWORD_MESSAGE = 'Password must be at least 10 characters and contain a letter and a number.';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export class RefreshDto {
  @IsString() @MinLength(20) @MaxLength(400) refreshToken: string;
}

export class LogoutDto {
  @IsOptional() @IsString() @MaxLength(400) refreshToken?: string;
}

export class ForgotPasswordDto {
  @IsEmail() email: string;
  @IsIn(['STAFF', 'CUSTOMER']) kind: 'STAFF' | 'CUSTOMER';
}

export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(400) token: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) newPassword: string;
}
