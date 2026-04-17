import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { N8nService } from './n8n.service';

@Module({
  imports: [ConfigModule],
  providers: [N8nService],
  exports: [N8nService],
})
export class N8nModule {}

