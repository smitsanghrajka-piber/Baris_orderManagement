import { Logger } from '@nestjs/common';

export interface SendEmailOpts {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
}

export interface MailProvider {
  readonly name: string;
  send(opts: SendEmailOpts): Promise<void>;
}

/** EMAIL_TRANSPORT=none — the default; nothing leaves the box. */
class NoneProvider implements MailProvider {
  readonly name = 'none';
  private readonly log = new Logger('Mail');
  async send(opts: SendEmailOpts) {
    this.log.log(`[transport=none] would send "${opts.subject}" to ${opts.to}`);
  }
}

/** EMAIL_TRANSPORT=smtp — nodemailer with SMTP_* env. */
class SmtpProvider implements MailProvider {
  readonly name = 'smtp';
  private transporter: any;
  constructor(private readonly from: string) {}
  async send(opts: SendEmailOpts) {
    if (!this.transporter) {
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    }
    await this.transporter.sendMail({ from: this.from, to: opts.toName ? `"${opts.toName.replace(/"/g, '')}" <${opts.to}>` : opts.to, subject: opts.subject, html: opts.html, text: opts.text ?? undefined });
  }
}

/** EMAIL_TRANSPORT=resend — Resend HTTP API with RESEND_API_KEY. */
class ResendProvider implements MailProvider {
  readonly name = 'resend';
  constructor(private readonly from: string, private readonly apiKey: string) {}
  async send(opts: SendEmailOpts) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text ?? undefined }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

export function createMailProvider(): MailProvider {
  const transport = (process.env.EMAIL_TRANSPORT ?? 'none').toLowerCase();
  const from = process.env.EMAIL_FROM ?? 'Baris IML <no-reply@barisiml.com.au>';
  switch (transport) {
    case 'none': return new NoneProvider();
    case 'smtp': return new SmtpProvider(from);
    case 'resend': {
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error('EMAIL_TRANSPORT=resend requires RESEND_API_KEY');
      return new ResendProvider(from, key);
    }
    default: throw new Error(`Unknown EMAIL_TRANSPORT "${transport}" (none | smtp | resend)`);
  }
}
