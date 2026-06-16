import { IsIn, IsOptional } from 'class-validator';

export class QueryPdfImportsDto {
  @IsOptional()
  @IsIn(['PENDING_REVIEW', 'PARTIALLY_DONE', 'COMPLETED'])
  status?: 'PENDING_REVIEW' | 'PARTIALLY_DONE' | 'COMPLETED';
}
