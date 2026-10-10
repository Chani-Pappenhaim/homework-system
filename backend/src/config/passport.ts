import { PassportStatic } from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { findUserByEmail } from '../services/auth.service';

export function configurePassport(passport: PassportStatic) {
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        const user = await findUserByEmail(email);
        if (!user) return done(null, false, { message: 'Invalid credentials' });
        if (!user.password) return done(null, false, { message: 'Use OAuth to login' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return done(null, false, { message: 'Invalid credentials' });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  if (process.env.GITHUB_CLIENT_ID) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          callbackURL: process.env.GITHUB_CALLBACK_URL!,
          scope: ['user:email'],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error('No email from GitHub'));

            const user = await findUserByEmail(email);
            // Only accounts the teacher has already added may sign in. OAuth
            // links to an existing account by email — it never creates one.
            if (!user) return done(null, false, { message: 'unregistered' });

            // The provider vouches for the address, so it counts as verified.
            if (!user.oauthProvider || !user.emailVerifiedAt) {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  ...(!user.oauthProvider ? { oauthProvider: 'github', oauthId: profile.id } : {}),
                  emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
                },
              });
            }
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }

  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error('No email from Google'));

            const user = await findUserByEmail(email);
            // Only accounts the teacher has already added may sign in. OAuth
            // links to an existing account by email — it never creates one.
            if (!user) return done(null, false, { message: 'unregistered' });

            // The provider vouches for the address, so it counts as verified.
            if (!user.oauthProvider || !user.emailVerifiedAt) {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  ...(!user.oauthProvider ? { oauthProvider: 'google', oauthId: profile.id } : {}),
                  emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
                },
              });
            }
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }
}
