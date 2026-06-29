import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DevOtpService } from './dev-otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { initFirebaseAdmin } from '../../config/firebase.config';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, DevOtpService, JwtStrategy],
  exports: [JwtModule, PassportModule, AuthService],
})
export class AuthModule implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    // Initialise Firebase Admin SDK as soon as the module loads
    initFirebaseAdmin(this.configService);
  }
}
