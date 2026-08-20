import express from 'express';
import session from 'express-session';
import cors from 'cors';
import passport from './auth/passport.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requireAuth } from './middleware/auth.js';
import { prisma } from './lib/prisma.js';
import { scheduleEmailsForUser, getUserSenders, createSenderForUser } from './services/schedule.service.js';
import { parseRecipientList } from './email/parseRecipients.js';
import { queue } from './queue/email.queue.js';
import multer from 'multer';
import { z } from 'zod';

const storage = multer.memoryStorage();
const upload = multer({ storage });

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: 'healthy' });
  });

  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get(
    '/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${env.FRONTEND_URL}/login?error=google` }),
    (req, res) => {
      res.redirect(`${env.FRONTEND_URL}/dashboard`);
    },
  );

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'User not found' });

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });

    res.json(currentUser);
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    req.logout?.(() => {
      req.session?.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ ok: true });
      });
    });
  });

  app.get('/api/senders', requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const senders = await getUserSenders(userId);
    res.json(senders);
  });

  app.post('/api/senders', requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const sender = await createSenderForUser(userId, {
      email: req.body.email,
      displayName: req.body.displayName,
      smtpHost: req.body.smtpHost || 'smtp.ethereal.email',
      smtpPort: Number(req.body.smtpPort || 587),
      smtpUser: req.body.smtpUser || req.body.email,
      smtpPass: req.body.smtpPass || 'change-me',
      hourlyLimit: Number(req.body.hourlyLimit || undefined),
      isDefault: false,
    });

    res.status(201).json(sender);
  });

  app.post('/api/emails/schedule', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const schema = z.object({
        subject: z.string().trim().min(1),
        body: z.string().min(1),
        startAt: z.string().min(1),
        delayMs: z.coerce.number().int().min(0).optional(),
        hourlyLimit: z.coerce.number().int().min(1).optional(),
        senderId: z.string().optional(),
        recipients: z.string().optional(),
      });

      const parseBody = schema.safeParse(req.body);
      if (!parseBody.success) {
        return res.status(400).json({ message: 'Invalid scheduling payload', errors: parseBody.error.flatten() });
      }

      let jsonRecipients: string[] = [];
      if (parseBody.data.recipients) {
        try {
          const parsed = JSON.parse(parseBody.data.recipients);
          jsonRecipients = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          jsonRecipients = parseBody.data.recipients.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
        }
      }

      const fileText = req.file?.buffer ? req.file.buffer.toString('utf-8') : '';
      const recipientList = parseRecipientList({
        recipients: jsonRecipients,
        fileContent: fileText,
      });

      if (recipientList.length === 0) {
        return res.status(400).json({ message: 'No valid recipient email addresses were found in request' });
      }

      const result = await scheduleEmailsForUser(userId, {
        subject: parseBody.data.subject,
        body: parseBody.data.body,
        startAt: parseBody.data.startAt,
        delayMs: parseBody.data.delayMs,
        hourlyLimit: parseBody.data.hourlyLimit,
        senderId: parseBody.data.senderId,
        recipients: recipientList.map((r) => r.email),
        fileContent: fileText,
      });

      return res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/emails/scheduled', requireAuth, async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const emails = await prisma.email.findMany({
      where: { userId: req.user?.id, status: { in: ['SCHEDULED', 'PROCESSING'] } },
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    res.json(emails);
  });

  app.get('/api/emails/sent', requireAuth, async (req, res) => {
    const emails = await prisma.email.findMany({
      where: { userId: req.user?.id, status: { in: ['SENT', 'FAILED'] } },
      orderBy: { sentAt: 'desc' },
    });
    res.json(emails);
  });

  app.get('/api/emails/:id', requireAuth, async (req, res) => {
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId: req.user?.id },
    });

    if (!email) return res.status(404).json({ message: 'Email not found' });
    res.json(email);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
