import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('db-info')
  getDbInfo() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return { error: 'DATABASE_URL environment variable is not set' };
    }
    try {
      const parsed = new URL(dbUrl);
      return {
        username: parsed.username,
        host: parsed.host,
        database: parsed.pathname.replace('/', ''),
        schema: parsed.searchParams.get('schema') || 'not specified',
      };
    } catch (e: any) {
      return { error: `Failed to parse URL: ${e.message}`, rawLength: dbUrl.length };
    }
  }
}
