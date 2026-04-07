import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RagService } from './rag.service';
import { PgvectorRetriever } from './retrievers/pgvector.retriever';
import { RetrievalPolicyService } from './policies/retrieval-policy.service';

@Module({
  providers: [
    PrismaService,
    RagService,
    PgvectorRetriever,
    RetrievalPolicyService,
  ],
  exports: [RagService],
}) 
export class RagModule {}