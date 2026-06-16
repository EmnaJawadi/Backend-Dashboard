import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiMetricsDto, AnalyticsTimelinePointDto } from './dto/ai-metrics.dto';
import { AnalyticsOverviewDto } from './dto/analytics-overview.dto';
import { ConversationMetricsDto } from './dto/conversation-metrics.dto';
import { ConversationsAnalyticsQuery } from './queries/conversations-analytics.query';
import { AiRunsAnalyticsQuery } from './queries/ai-runs-analytics.query';

type AnalyticsGroupBy = 'day' | 'week' | 'month';

type TableMeta = {
  tableName: string | null;
  columns: Set<string>;
};

type NumericRow = Record<string, unknown>;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    query: ConversationsAnalyticsQuery,
    actor?: AuthenticatedUser,
  ): Promise<AnalyticsOverviewDto> {
    const normalized = this.normalizeQuery(query);

    const [conversations, aiRuns] = await Promise.all([
      this.getConversationMetrics(normalized, actor),
      this.getAiRunsMetrics(normalized, actor),
    ]);

    return new AnalyticsOverviewDto({
      generatedAt: new Date().toISOString(),
      period: {
        startDate: normalized.startDate ?? null,
        endDate: normalized.endDate ?? null,
        groupBy: normalized.groupBy,
      },
      conversations,
      aiRuns,
    });
  }

  async getConversationMetrics(
    query: ConversationsAnalyticsQuery,
    actor?: AuthenticatedUser,
  ): Promise<ConversationMetricsDto> {
    const normalized = this.normalizeQuery(query);
    const companyId = resolveCompanyScope(actor);
    const meta = await this.getTableMeta([
      'Conversation',
      'conversation',
      'conversations',
    ]);

    if (!meta.tableName) {
      return new ConversationMetricsDto({
        totalConversations: 0,
        openConversations: 0,
        closedConversations: 0,
        resolutionRate: 0,
        averageMessagesPerConversation: 0,
        averageFirstResponseTimeMs: 0,
        averageResolutionTimeMs: 0,
        timeline: [],
      });
    }

    const createdAtColumn = this.pickFirstExisting(meta.columns, [
      'createdAt',
      'created_at',
    ]);
    const statusColumn = this.pickFirstExisting(meta.columns, [
      'status',
      'conversationStatus',
      'conversation_status',
    ]);
    const messagesCountColumn = this.pickFirstExisting(meta.columns, [
      'messagesCount',
      'messages_count',
    ]);
    const firstResponseAtColumn = this.pickFirstExisting(meta.columns, [
      'firstResponseAt',
      'first_response_at',
    ]);
    const resolvedAtColumn = this.pickFirstExisting(meta.columns, [
      'resolvedAt',
      'resolved_at',
      'closedAt',
      'closed_at',
    ]);

    const whereClause = this.buildDateWhereClause(
      createdAtColumn,
      normalized.startDate,
      normalized.endDate,
      meta.columns,
      companyId,
    );

    const totalConversationsExpr = 'COUNT(*)::int AS "totalConversations"';

    const openConversationsExpr = statusColumn
      ? `COUNT(*) FILTER (
          WHERE LOWER(COALESCE(${this.q(statusColumn)}::text, '')) IN (
            'bot_active', 'human_assigned', 'waiting_customer',
            'open', 'pending', 'active'
          )
        )::int AS "openConversations"`
      : '0::int AS "openConversations"';

    const closedConversationsExpr = statusColumn
      ? `COUNT(*) FILTER (
          WHERE LOWER(COALESCE(${this.q(statusColumn)}::text, '')) IN ('closed', 'resolved', 'done')
        )::int AS "closedConversations"`
      : resolvedAtColumn
        ? `COUNT(*) FILTER (
            WHERE ${this.q(resolvedAtColumn)} IS NOT NULL
          )::int AS "closedConversations"`
        : '0::int AS "closedConversations"';

    const resolutionRateExpr = statusColumn
      ? `COALESCE(ROUND(
          (
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(${this.q(statusColumn)}::text, '')) IN ('closed', 'resolved', 'done')
            )::numeric
            / NULLIF(COUNT(*), 0)
          ) * 100, 2
        ), 0)::float AS "resolutionRate"`
      : resolvedAtColumn
        ? `COALESCE(ROUND(
            (
              COUNT(*) FILTER (WHERE ${this.q(resolvedAtColumn)} IS NOT NULL)::numeric
              / NULLIF(COUNT(*), 0)
            ) * 100, 2
          ), 0)::float AS "resolutionRate"`
        : '0::float AS "resolutionRate"';

    const avgMessagesExpr = messagesCountColumn
      ? `COALESCE(ROUND(AVG(COALESCE(${this.q(messagesCountColumn)}, 0))::numeric, 2), 0)::float AS "averageMessagesPerConversation"`
      : '0::float AS "averageMessagesPerConversation"';

    const avgFirstResponseExpr =
      createdAtColumn && firstResponseAtColumn
        ? `COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${this.q(firstResponseAtColumn)} - ${this.q(createdAtColumn)})) * 1000)::numeric, 2), 0)::float AS "averageFirstResponseTimeMs"`
        : '0::float AS "averageFirstResponseTimeMs"';

    const avgResolutionExpr =
      createdAtColumn && resolvedAtColumn
        ? `COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${this.q(resolvedAtColumn)} - ${this.q(createdAtColumn)})) * 1000)::numeric, 2), 0)::float AS "averageResolutionTimeMs"`
        : '0::float AS "averageResolutionTimeMs"';

    const totalsSql = `
      SELECT
        ${totalConversationsExpr},
        ${openConversationsExpr},
        ${closedConversationsExpr},
        ${resolutionRateExpr},
        ${avgMessagesExpr},
        ${avgFirstResponseExpr},
        ${avgResolutionExpr}
      FROM ${this.q(meta.tableName)}
      ${whereClause};
    `;

    const totalsResult = await this.safeRawQuery<NumericRow[]>(totalsSql);
    const totals = totalsResult[0] ?? {};

    const timeline = await this.getTimeline(
      meta.tableName,
      createdAtColumn,
      normalized.groupBy,
      normalized.startDate,
      normalized.endDate,
      meta.columns,
      companyId,
    );

    return new ConversationMetricsDto({
      totalConversations: this.toInt(totals.totalConversations),
      openConversations: this.toInt(totals.openConversations),
      closedConversations: this.toInt(totals.closedConversations),
      resolutionRate: this.toNumber(totals.resolutionRate),
      averageMessagesPerConversation: this.toNumber(totals.averageMessagesPerConversation),
      averageFirstResponseTimeMs: this.toNumber(totals.averageFirstResponseTimeMs),
      averageResolutionTimeMs: this.toNumber(totals.averageResolutionTimeMs),
      timeline,
    });
  }

  async getAiRunsMetrics(
    query: AiRunsAnalyticsQuery,
    actor?: AuthenticatedUser,
  ): Promise<AiMetricsDto> {
    const normalized = this.normalizeQuery(query);
    const companyId = resolveCompanyScope(actor);
    const meta = await this.getTableMeta([
      'AiRun',
      'aiRun',
      'ai_run',
      'ai_runs',
      'airuns',
    ]);

    if (!meta.tableName) {
      return new AiMetricsDto({
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        successRate: 0,
        averageLatencyMs: 0,
        averageConfidenceScore: 0,
        totalTokensUsed: 0,
        averageTokensUsed: 0,
        totalEstimatedCost: 0,
        timeline: [],
      });
    }

    const createdAtColumn = this.pickFirstExisting(meta.columns, [
      'createdAt',
      'created_at',
    ]);
    const statusColumn = this.pickFirstExisting(meta.columns, [
      'status',
      'runStatus',
      'run_status',
    ]);
    const latencyColumn = this.pickFirstExisting(meta.columns, [
      'latencyMs',
      'latency_ms',
      'durationMs',
      'duration_ms',
      'responseTimeMs',
      'response_time_ms',
    ]);
    const confidenceColumn = this.pickFirstExisting(meta.columns, [
      'confidenceScore',
      'confidence_score',
      'score',
    ]);
    const tokensColumn = this.pickFirstExisting(meta.columns, [
      'tokensUsed',
      'tokens_used',
      'totalTokens',
      'total_tokens',
    ]);
    const costColumn = this.pickFirstExisting(meta.columns, [
      'costUsd',
      'cost_usd',
      'estimatedCost',
      'estimated_cost',
    ]);

    const whereClause = this.buildDateWhereClause(
      createdAtColumn,
      normalized.startDate,
      normalized.endDate,
      meta.columns,
      companyId,
    );

    const totalRunsExpr = 'COUNT(*)::int AS "totalRuns"';

    const successfulRunsExpr = statusColumn
      ? `COUNT(*) FILTER (
          WHERE LOWER(COALESCE(${this.q(statusColumn)}::text, '')) IN ('success', 'completed', 'done')
        )::int AS "successfulRuns"`
      : '0::int AS "successfulRuns"';

    const failedRunsExpr = statusColumn
      ? `COUNT(*) FILTER (
          WHERE LOWER(COALESCE(${this.q(statusColumn)}::text, '')) IN ('failed', 'error', 'cancelled')
        )::int AS "failedRuns"`
      : '0::int AS "failedRuns"';

    const successRateExpr = statusColumn
      ? `COALESCE(ROUND(
          (
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(${this.q(statusColumn)}::text, '')) IN ('success', 'completed', 'done')
            )::numeric
            / NULLIF(COUNT(*), 0)
          ) * 100, 2
        ), 0)::float AS "successRate"`
      : '0::float AS "successRate"';

    const avgLatencyExpr = latencyColumn
      ? `COALESCE(ROUND(AVG(COALESCE(${this.q(latencyColumn)}, 0))::numeric, 2), 0)::float AS "averageLatencyMs"`
      : '0::float AS "averageLatencyMs"';

    const avgConfidenceExpr = confidenceColumn
      ? `COALESCE(ROUND(AVG(COALESCE(${this.q(confidenceColumn)}, 0))::numeric, 4), 0)::float AS "averageConfidenceScore"`
      : '0::float AS "averageConfidenceScore"';

    const totalTokensExpr = tokensColumn
      ? `COALESCE(SUM(COALESCE(${this.q(tokensColumn)}, 0)), 0)::int AS "totalTokensUsed"`
      : '0::int AS "totalTokensUsed"';

    const avgTokensExpr = tokensColumn
      ? `COALESCE(ROUND(AVG(COALESCE(${this.q(tokensColumn)}, 0))::numeric, 2), 0)::float AS "averageTokensUsed"`
      : '0::float AS "averageTokensUsed"';

    const totalCostExpr = costColumn
      ? `COALESCE(ROUND(SUM(COALESCE(${this.q(costColumn)}, 0))::numeric, 6), 0)::float AS "totalEstimatedCost"`
      : '0::float AS "totalEstimatedCost"';

    const totalsSql = `
      SELECT
        ${totalRunsExpr},
        ${successfulRunsExpr},
        ${failedRunsExpr},
        ${successRateExpr},
        ${avgLatencyExpr},
        ${avgConfidenceExpr},
        ${totalTokensExpr},
        ${avgTokensExpr},
        ${totalCostExpr}
      FROM ${this.q(meta.tableName)}
      ${whereClause};
    `;

    const totalsResult = await this.safeRawQuery<NumericRow[]>(totalsSql);
    const totals = totalsResult[0] ?? {};

    const timeline = await this.getTimeline(
      meta.tableName,
      createdAtColumn,
      normalized.groupBy,
      normalized.startDate,
      normalized.endDate,
      meta.columns,
      companyId,
    );

    return new AiMetricsDto({
      totalRuns: this.toInt(totals.totalRuns),
      successfulRuns: this.toInt(totals.successfulRuns),
      failedRuns: this.toInt(totals.failedRuns),
      successRate: this.toNumber(totals.successRate),
      averageLatencyMs: this.toNumber(totals.averageLatencyMs),
      averageConfidenceScore: this.toNumber(totals.averageConfidenceScore),
      totalTokensUsed: this.toInt(totals.totalTokensUsed),
      averageTokensUsed: this.toNumber(totals.averageTokensUsed),
      totalEstimatedCost: this.toNumber(totals.totalEstimatedCost),
      timeline,
    });
  }

  private normalizeQuery(
    query: Partial<ConversationsAnalyticsQuery & AiRunsAnalyticsQuery>,
  ): Required<Pick<ConversationsAnalyticsQuery, 'groupBy'>> & {
    startDate?: string;
    endDate?: string;
  } {
    const groupBy = (query.groupBy ?? 'day') as AnalyticsGroupBy;

    return {
      startDate: query.startDate,
      endDate: query.endDate,
      groupBy: ['day', 'week', 'month'].includes(groupBy) ? groupBy : 'day',
    };
  }

  private async getTimeline(
    tableName: string,
    createdAtColumn: string | null,
    groupBy: AnalyticsGroupBy,
    startDate?: string,
    endDate?: string,
    columns?: Set<string>,
    companyId?: string,
  ): Promise<AnalyticsTimelinePointDto[]> {
    if (!createdAtColumn) {
      return [];
    }

    const whereClause = this.buildDateWhereClause(
      createdAtColumn,
      startDate,
      endDate,
      columns,
      companyId,
    );

    const sql = `
      SELECT
        TO_CHAR(DATE_TRUNC('${groupBy}', ${this.q(createdAtColumn)}), 'YYYY-MM-DD') AS label,
        COUNT(*)::int AS value
      FROM ${this.q(tableName)}
      ${whereClause}
      GROUP BY DATE_TRUNC('${groupBy}', ${this.q(createdAtColumn)})
      ORDER BY DATE_TRUNC('${groupBy}', ${this.q(createdAtColumn)}) ASC;
    `;

    const rows = await this.safeRawQuery<Array<{ label: string; value: unknown }>>(sql);

    return rows.map(
      (row) =>
        new AnalyticsTimelinePointDto({
          label: row.label,
          value: this.toInt(row.value),
        }),
    );
  }

  private async getTableMeta(candidates: string[]): Promise<TableMeta> {
    const lowered = candidates.map((name) => name.toLowerCase());
    const inClause = lowered.map((value) => `'${this.escapeLiteral(value)}'`).join(', ');

    const tableSql = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND LOWER(table_name) IN (${inClause})
      ORDER BY table_name
      LIMIT 1;
    `;

    const tables = await this.safeRawQuery<Array<{ table_name: string }>>(tableSql);
    const tableName = tables[0]?.table_name ?? null;

    if (!tableName) {
      return { tableName: null, columns: new Set<string>() };
    }

    const columnsSql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = '${this.escapeLiteral(tableName)}';
    `;

    const columns = await this.safeRawQuery<Array<{ column_name: string }>>(columnsSql);

    return {
      tableName,
      columns: new Set(columns.map((col) => col.column_name)),
    };
  }

  private buildDateWhereClause(
    dateColumn: string | null,
    startDate?: string,
    endDate?: string,
    columns?: Set<string>,
    companyId?: string,
  ): string {
    const conditions: string[] = [];

    if (dateColumn && startDate) {
      conditions.push(`${this.q(dateColumn)} >= '${this.escapeLiteral(startDate)}'::timestamptz`);
    }

    if (dateColumn && endDate) {
      conditions.push(`${this.q(dateColumn)} <= '${this.escapeLiteral(endDate)}'::timestamptz`);
    }

    const companyColumn = this.pickFirstExisting(columns ?? new Set(), [
      'companyId',
      'company_id',
    ]);

    if (companyId && companyColumn) {
      conditions.push(`${this.q(companyColumn)} = '${this.escapeLiteral(companyId)}'`);
    }

    if (!conditions.length) {
      return '';
    }

    return `WHERE ${conditions.join(' AND ')}`;
  }

  private pickFirstExisting(columns: Set<string>, candidates: string[]): string | null {
    for (const candidate of candidates) {
      if (columns.has(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private q(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private escapeLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toInt(value: unknown): number {
    return Math.trunc(this.toNumber(value));
  }

  private async safeRawQuery<T>(sql: string): Promise<T> {
    try {
      return (await this.prisma.$queryRawUnsafe(sql)) as T;
    } catch (error) {
      throw new InternalServerErrorException(
        `Analytics query failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
