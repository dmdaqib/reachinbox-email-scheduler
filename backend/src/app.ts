import express from 'express';
import session from 'express-session';
import cors from 'cors';
import passport from './auth/passport.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requireAuth } from './middleware/auth.js';
import { prisma } from './lib/prisma.js';
import { scheduleEmailsForUser, getUserSenders, createSenderForUser, cancelScheduledEmail } from './services/schedule.service.js';
import { parseRecipientList } from './email/parseRecipients.js';
import { queue } from './queue/email.queue.js';
import multer from 'multer';
import { z } from 'zod';
import { generateAuthToken } from './auth/token.js';

const storage = multer.memoryStorage();
const upload = multer({ storage });

export function createApp() {
  const app = express();
  const isProd = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

  if (isProd) {
    app.set('trust proxy', 1);
  }

  const allowedOrigins = [
    env.FRONTEND_URL,
    'https://reachinbox-email-scheduler-1-fl9q.onrender.com',
    'http://localhost:5173',
    'http://localhost:4000',
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalizedOrigin = origin.replace(/\/$/, '');
        const isAllowed = allowedOrigins.some(
          (allowed) => allowed && allowed.replace(/\/$/, '') === normalizedOrigin,
        );
        if (isAllowed) {
          return callback(null, true);
        }
        return callback(null, true);
      },
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
      proxy: isProd,
      cookie: {
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ ok: true, status: 'healthy' });
  });

  // Google OAuth Auth Routes
  app.get('/api/auth/google', (req, res, next) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({
        error: 'Google OAuth Misconfigured',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables must be configured on Render.',
      });
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });

  app.get(
    '/api/auth/google/callback',
    (req, res, next) => {
      const fallbackFrontend = isProd
        ? 'https://reachinbox-email-scheduler-1-fl9q.onrender.com'
        : 'http://localhost:5173';
      const baseFrontend = env.FRONTEND_URL && !env.FRONTEND_URL.includes('localhost')
        ? env.FRONTEND_URL
        : (isProd ? fallbackFrontend : env.FRONTEND_URL);
      const redirectBase = baseFrontend.replace(/\/$/, '');

      passport.authenticate('google', { failureRedirect: `${redirectBase}/login?error=google` })(req, res, next);
    },
    (req, res) => {
      req.session.save((err) => {
        if (err) {
          console.error('[OAuth Session Error] Failed to save session:', err);
        }
        const user = req.user as { id?: string } | undefined;
        const token = user?.id ? generateAuthToken(user.id) : '';

        const fallbackFrontend = isProd
          ? 'https://reachinbox-email-scheduler-1-fl9q.onrender.com'
          : 'http://localhost:5173';
        const baseFrontend = env.FRONTEND_URL && !env.FRONTEND_URL.includes('localhost')
          ? env.FRONTEND_URL
          : (isProd ? fallbackFrontend : env.FRONTEND_URL);
        const frontendUrl = baseFrontend.replace(/\/$/, '');

        const targetUrl = token
          ? `${frontendUrl}/dashboard?token=${encodeURIComponent(token)}`
          : `${frontendUrl}/dashboard`;

        console.log(`[OAuth Redirect] Redirecting user ${user?.id ?? 'unknown'} to: ${targetUrl}`);
        res.redirect(targetUrl);
      });
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

  app.post('/api/auth/logout', (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    });
  });

  // Sender Profiles API
  app.get('/api/senders', requireAuth, async (req, res, next) => {
    try {
      const senders = await getUserSenders(req.user!.id);
      res.json(senders);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/senders', requireAuth, async (req, res, next) => {
    try {
      const senderSchema = z.object({
        email: z.string().email(),
        displayName: z.string().min(1),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        isDefault: z.boolean().optional(),
        hourlyLimit: z.number().optional(),
      });
      const data = senderSchema.parse(req.body);
      const sender = await createSenderForUser(req.user!.id, data);
      res.json(sender);
    } catch (err) {
      next(err);
    }
  });

  // Scheduling API (POST /api/emails/schedule)
  app.post('/api/emails/schedule', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
      const fileContent = req.file ? req.file.buffer.toString('utf-8') : undefined;
      const recipientsRaw = req.body.recipients ? JSON.parse(req.body.recipients) : [];

      const result = await scheduleEmailsForUser(req.user!.id, {
        subject: req.body.subject,
        body: req.body.body,
        startAt: req.body.startAt,
        delayMs: req.body.delayMs ? Number(req.body.delayMs) : undefined,
        hourlyLimit: req.body.hourlyLimit ? Number(req.body.hourlyLimit) : undefined,
        senderId: req.body.senderId,
        recipients: recipientsRaw,
        fileContent,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  // Cancel Scheduled Email API
  app.post('/api/emails/:id/cancel', requireAuth, async (req, res, next) => {
    try {
      const emailId = req.params.id;
      const result = await cancelScheduledEmail(req.user!.id, emailId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Listing Scheduled Emails API
  app.get('/api/emails/scheduled', requireAuth, async (req, res, next) => {
    try {
      const scheduled = await prisma.email.findMany({
        where: { userId: req.user?.id, status: { in: ['SCHEDULED', 'PROCESSING'] } },
        orderBy: { scheduledAt: 'asc' },
        include: { sender: { select: { displayName: true, email: true } } },
      });
      res.json(scheduled);
    } catch (err) {
      next(err);
    }
  });

  // Listing Sent Emails API
  app.get('/api/emails/sent', requireAuth, async (req, res, next) => {
    try {
      const sent = await prisma.email.findMany({
        where: { userId: req.user?.id, status: { in: ['SENT', 'FAILED'] } },
        orderBy: { updatedAt: 'desc' },
        include: { sender: { select: { displayName: true, email: true } } },
      });
      res.json(sent);
    } catch (err) {
      next(err);
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
