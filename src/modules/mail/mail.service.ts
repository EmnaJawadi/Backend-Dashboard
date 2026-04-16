import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private lastErrorMessage: string | null = null;

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER?.trim();
    const rawPass = process.env.SMTP_PASS ?? '';
    const pass = rawPass.replace(/\s+/g, '').trim();
    const secure = process.env.SMTP_SECURE === 'true';

    if (!host) {
      this.lastErrorMessage = 'SMTP_HOST is missing.';
      this.logger.warn(
        'SMTP_HOST is not configured. Email sending is disabled.',
      );
      return null;
    }

    if (
      !user ||
      !pass ||
      pass === 'your_app_password' ||
      pass === 'GMAIL_APP_PASSWORD_16_CHARS'
    ) {
      this.lastErrorMessage =
        'SMTP credentials are invalid or missing. Configure SMTP_USER and SMTP_PASS (Gmail App Password) in backend .env.';
      this.logger.warn(
        'SMTP credentials are invalid or missing. Email sending is disabled.',
      );
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    this.lastErrorMessage = null;

    return this.transporter;
  }

  private getFromAddress(): string {
    return process.env.SMTP_FROM?.trim() || 'no-reply@support.local';
  }

  private async sendMail(payload: MailPayload): Promise<boolean> {
    const transporter = this.getTransporter();

    if (!transporter) {
      return false;
    }

    try {
      const info = await transporter.sendMail({
        from: this.getFromAddress(),
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      this.logger.log(
        `[MAIL][SENT] to=${payload.to} subject=${payload.subject} messageId=${info.messageId}`,
      );
      this.lastErrorMessage = null;
      return true;
    } catch (error) {
      this.lastErrorMessage = error instanceof Error ? error.message : 'SMTP send failed';
      this.logger.error(
        `[MAIL][FAILED] to=${payload.to} subject=${payload.subject}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  getLastErrorMessage(): string | null {
    return this.lastErrorMessage;
  }

  async sendWelcomeEmail(params: { to: string; fullName?: string }) {
    const fullName = this.escapeHtml(params.fullName ?? 'Utilisateur');

    return this.sendMail({
      to: params.to,
      subject: 'Bienvenue sur Support Dashboard',
      html: `<h2>Bienvenue ${fullName}</h2><p>Votre compte est pret.</p>`,
      text: `Bienvenue ${params.fullName ?? 'Utilisateur'}. Votre compte est pret.`,
    });
  }

  async sendForgotPasswordEmail(params: {
    to: string;
    fullName?: string;
    resetLink: string;
  }) {
    const fullName = this.escapeHtml(params.fullName ?? 'Utilisateur');
    const resetLink = this.escapeHtml(params.resetLink);

    return this.sendMail({
      to: params.to,
      subject: 'Reinitialisation de mot de passe',
      html: `<h2>Reinitialisation de mot de passe</h2>
<p>Bonjour ${fullName},</p>
<p>Cliquez sur ce lien pour reinitialiser votre mot de passe :</p>
<p><a href="${resetLink}">${resetLink}</a></p>
<p>Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>`,
      text: `Bonjour ${params.fullName ?? 'Utilisateur'}, utilisez ce lien pour reinitialiser votre mot de passe: ${params.resetLink}`,
    });
  }

  async sendInviteUserEmail(params: {
    to: string;
    invitedBy?: string;
    inviteLink: string;
    workspaceName?: string;
  }) {
    const invitedBy = this.escapeHtml(params.invitedBy ?? 'Administrateur');
    const workspaceName = this.escapeHtml(
      params.workspaceName ?? 'Support Dashboard',
    );
    const inviteLink = this.escapeHtml(params.inviteLink);

    return this.sendMail({
      to: params.to,
      subject: `Invitation a rejoindre ${params.workspaceName ?? 'Support Dashboard'}`,
      html: `<h2>Invitation</h2>
<p>${invitedBy} vous a invite a rejoindre ${workspaceName}.</p>
<p><a href="${inviteLink}">${inviteLink}</a></p>`,
      text: `${params.invitedBy ?? 'Administrateur'} vous a invite a rejoindre ${params.workspaceName ?? 'Support Dashboard'}: ${params.inviteLink}`,
    });
  }
}
