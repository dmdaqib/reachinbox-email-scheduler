import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { senders: true },
    });
    done(null, user as Express.User | null);
  } catch (error) {
    done(error);
  }
});

const googleClientId = env.GOOGLE_CLIENT_ID || (env.NODE_ENV === 'test' ? 'test-google-client-id' : '');
const googleClientSecret = env.GOOGLE_CLIENT_SECRET || (env.NODE_ENV === 'test' ? 'test-google-client-secret' : '');
const callbackURL = `${env.BACKEND_URL.replace(/\/$/, '')}/api/auth/google/callback`;

if (googleClientId && googleClientSecret) {
  const maskedId = googleClientId.length > 12
    ? `${googleClientId.slice(0, 6)}...${googleClientId.slice(-10)}`
    : googleClientId;
  console.log(`[Google OAuth Config] Loaded GOOGLE_CLIENT_ID: ${maskedId}`);
  console.log(`[Google OAuth Config] Registered OAuth Callback URL: ${callbackURL}`);

  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL,
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
      try {
        if (!profile.emails?.[0]?.value) {
          return done(new Error('Google account email is required'));
        }

        const email = profile.emails[0].value;
        const name = profile.displayName || profile.name?.givenName || email;
        const avatarUrl = profile.photos?.[0]?.value || null;

        const existing = await prisma.user.findUnique({ where: { email } });
        let user = existing;

        if (!existing) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email,
              name,
              avatarUrl,
            },
          });
        } else {
          user = await prisma.user.update({
            where: { email },
            data: {
              googleId: profile.id,
              name,
              avatarUrl,
            },
          });
        }

        const defaultSender = await prisma.sender.findFirst({
          where: { userId: user.id, isDefault: true },
        });

        if (!defaultSender) {
          const senderEmail = env.DEFAULT_SENDER_EMAIL || email;
          const senderName = env.DEFAULT_SENDER_NAME || name;
          await prisma.sender.create({
            data: {
              userId: user.id,
              email: senderEmail,
              displayName: senderName,
              smtpHost: env.ETHEREAL_HOST || 'smtp.ethereal.email',
              smtpPort: env.ETHEREAL_PORT || 587,
              smtpUser: env.ETHEREAL_USER || senderEmail,
              smtpPass: env.ETHEREAL_PASS || 'change-me',
              isDefault: true,
              hourlyLimit: env.MAX_EMAILS_PER_HOUR,
            },
          });
        }

        return done(null, {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          googleId: user.googleId,
        });
      } catch (error) {
        done(error as Error);
      }
    },
  ),
);
}

export default passport;
