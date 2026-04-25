import { Body, Controller, Post } from '@nestjs/common';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagService } from './rag.service';

@Controller(['rag', 'api/rag'])
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('search')
  search(@Body() dto: RagQueryDto) {
    return this.ragService.query(dto);
  }
}
