import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsNotEmpty } from 'class-validator';

export class RegisterFcmTokenDto {
  @ApiProperty({
    description: 'FCM device registration token',
    example: 'fcm_token_string_here',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    enum: ['android', 'ios'],
    description: 'Target mobile platform',
  })
  @IsEnum(['android', 'ios'])
  platform!: 'android' | 'ios';
}
