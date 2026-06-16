import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
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
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(loginDto);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user, tokenType: 'Cookie' };
  }

  @Post('refresh')
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh({
      refreshToken:
        refreshTokenDto.refreshToken ?? this.readCookie(request, 'refresh_token'),
    });
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user, tokenType: 'Cookie' };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    this.clearAuthCookies(response);
    return { success: true };
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
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() actor: AuthenticatedUser) {
    return this.authService.getProfile(actor.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(actor.sub, updateProfileDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(actor.sub, changePasswordDto);
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const secure = process.env.NODE_ENV === 'production';
    const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
    const sameSite = 'lax' as const;

    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
      maxAge: 15 * 60 * 1000,
    });
    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(response: Response) {
    const secure = process.env.NODE_ENV === 'production';
    const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
    const sameSite = 'lax' as const;

    for (const name of ['access_token', 'refresh_token']) {
      response.clearCookie(name, {
        httpOnly: true,
        secure,
        sameSite,
        domain,
        path: '/',
      });
    }
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;

    for (const part of cookieHeader.split(';')) {
      const [key, ...valueParts] = part.trim().split('=');
      if (key === name) {
        return decodeURIComponent(valueParts.join('='));
      }
    }

    return undefined;
  }
}
