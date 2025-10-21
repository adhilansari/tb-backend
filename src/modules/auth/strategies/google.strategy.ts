import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { PrismaService } from '@/common/database/prisma.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const clientID = configService.get('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get('GOOGLE_CLIENT_SECRET');
    const callbackURL = configService.get('GOOGLE_CALLBACK_URL');

    // Only initialize if Google OAuth is configured
    if (!clientID || !clientSecret) {
      super({
        clientID: 'dummy',
        clientSecret: 'dummy',
        callbackURL: 'http://localhost:3000',
      });
      return;
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { emails, displayName, photos } = profile;
    const email = emails?.[0]?.value;
    const avatarUrl = photos?.[0]?.value;

    if (!email) {
      this.logger.error('No email found in Google profile');
      return done(new Error('No email found in Google profile'), undefined);
    }

    try {
      // Find existing user by email
      let user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Create new user if doesn't exist
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);

        user = await this.prisma.user.create({
          data: {
            email,
            username,
            displayName: displayName || 'User',
            password: '', // OAuth users don't have password
            verified: true,
            avatarUrl,
          },
        });

        this.logger.log(`New user created via Google OAuth: ${user.username}`);
      }

      done(null, user);
    } catch (error) {
      this.logger.error(`Google OAuth validation failed: ${error}`);
      done(error as Error, undefined);
    }
  }
}
