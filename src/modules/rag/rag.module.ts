import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { PgvectorRetriever } from './retrievers/pgvector.retriever';
import { RetrievalPolicyService } from './policies/retrieval-policy.service';
import { ProductsModule } from '../products/products.module';
import { EmbeddingsService } from '../knowledge-base/ingestion/embeddings.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [RagController],
  providers: [
    RagService,
    PgvectorRetriever,
    RetrievalPolicyService,
    EmbeddingsService,
  ],
  exports: [RagService],
}) 
export class RagModule {}
