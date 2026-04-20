import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RagService } from './rag.service';
import { PgvectorRetriever } from './retrievers/pgvector.retriever';
import { RetrievalPolicyService } from './policies/retrieval-policy.service';

@Module({
  imports: [PrismaModule],
  providers: [
    RagService,
    PgvectorRetriever,
    RetrievalPolicyService,
  ],
  exports: [RagService],
}) 
export class RagModule {}
