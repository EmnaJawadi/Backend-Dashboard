import { RagQueryDto } from './dto/rag-query.dto';
import { RagResultDto } from './dto/rag-result.dto';

export interface RagSearchService {
  query(dto: RagQueryDto): Promise<RagResultDto>;
}
