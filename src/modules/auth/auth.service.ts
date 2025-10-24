import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly storage: StorageService
  ) { }

  /**
   * Register new user
   */
  async register(registerDto: RegisterDto): Promise<any> {
    // Check if email or username already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: registerDto.email }, { username: registerDto.username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === registerDto.email) {
        throw new ConflictException('Email already registered');
      }
      throw new ConflictException('Username already taken');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        username: registerDto.username,
        displayName: registerDto.displayName,
        password: hashedPassword,
        bio: registerDto.bio,
        role: registerDto.isCreator ? 'CREATOR' : 'USER',
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    this.logger.log(`New user registered: ${user.username}`);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  /**
   * Login user
   */
  async login(loginDto: LoginDto): Promise<any> {
    // Find user by email or username
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: loginDto.emailOrUsername }, { username: loginDto.emailOrUsername }],
        deletedAt: null,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.username}`);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Return user without password
    const { password, ...userWithoutPassword } = user;

    // Transform avatar URL to presigned URL
    const userWithPresignedAvatar = await this.transformUserAvatarUrl(userWithoutPassword);

    return {
      user: userWithPresignedAvatar,
      ...tokens,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<any> {
    // Find refresh token in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is expired
    if (new Date() > storedToken.expiresAt) {
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Check if user is deleted
    if (storedToken.user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(storedToken.user);

    // Delete old refresh token
    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    // Return user without password
    const { password, ...userWithoutPassword } = storedToken.user;

    // Transform avatar URL to presigned URL
    const userWithPresignedAvatar = await this.transformUserAvatarUrl(userWithoutPassword);

    return {
      user: userWithPresignedAvatar,
      ...tokens,
    };
  }

  /**
   * Logout user (invalidate refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(user: any): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };

    // Generate access token (short-lived)
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.accessSecret'),
      expiresIn: this.configService.get('jwt.accessExpiry'),
    });

    // Generate refresh token (long-lived)
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: this.configService.get('jwt.refreshExpiry'),
    });

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Transform user avatar URL to presigned URL
   * Extracts S3 key from stored URL and generates fresh presigned URL
   */
  private async transformUserAvatarUrl(user: any): Promise<any> {
    if (!user.avatarUrl) {
      return user;
    }

    try {
      // Generate presigned URL from the stored key
      const presignedUrl = await this.storage.getPresignedUrl(user.avatarUrl, 3600);

      return {
        ...user,
        avatarUrl: presignedUrl,
      };
    } catch (error) {
      this.logger.warn('Failed to transform avatar URL:', error);
      return user;
    }
  }
}
