import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
} from '@nestjs/common';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerUserDto: RegisterUserDto) {
    return this.authService.register(registerUserDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.authService.getProfileFromToken(authorization);
  }

  @Patch('me')
  updateMe(
    @Headers('authorization') authorization: string | undefined,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfileFromToken(authorization, updateProfileDto);
  }

  @Post('change-password')
  changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePasswordFromToken(authorization, changePasswordDto);
  }
}
