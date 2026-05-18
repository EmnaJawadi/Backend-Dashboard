import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { GeminiModule } from '../../integrations/gemini/gemini.module';
import { ProductSearchService } from './product-search.service';
import { ProductVisionService } from './product-vision.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [ConfigModule, GeminiModule, PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductSearchService, ProductVisionService],
  exports: [ProductSearchService, ProductVisionService],
})
export class ProductsModule {}
