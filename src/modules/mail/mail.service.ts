import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendWelcomeEmail(params: { to: string; fullName?: string }) {
    this.logger.log(
      `[MAIL][WELCOME] to=${params.to} name=${params.fullName ?? ''}`,
    );
    return true;
  }

  async sendForgotPasswordEmail(params: {
    to: string;
    fullName?: string;
    resetLink: string;
  }) {
    this.logger.log(
      `[MAIL][FORGOT_PASSWORD] to=${params.to} link=${params.resetLink}`,
    );
    return true;
  }

  async sendInviteUserEmail(params: {
    to: string;
    invitedBy?: string;
    inviteLink: string;
    companyName?: string;
  }) {
    this.logger.log(
      `[MAIL][INVITE_USER] to=${params.to} company=${params.companyName ?? ''} link=${params.inviteLink}`,
    );
    return true;
  }
}