import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('Config')
@Controller('config')
export class ConfigController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Get application configuration' })
  getConfig() {
    return {
      appName: 'TreasuryBy',
      version: '1.0.0',
      features: {
        razorpayEnabled: !!process.env.RAZORPAY_KEY_ID,
        uploadEnabled: true,
        maxFileSize: 100 * 1024 * 1024, // 100MB
      },
    };
  }
}
