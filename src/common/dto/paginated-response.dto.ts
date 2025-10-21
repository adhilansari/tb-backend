import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ description: 'Current page number', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Total number of items', example: 100 })
  total!: number;

  @ApiProperty({ description: 'Total number of pages', example: 10 })
  totalPages!: number;

  @ApiProperty({ description: 'Has previous page', example: false })
  hasPrevious!: boolean;

  @ApiProperty({ description: 'Has next page', example: true })
  hasNext!: boolean;
}

export class PaginatedResponse<T> {
  @ApiProperty({ description: 'Array of items' })
  data!: T[];

  @ApiProperty({ description: 'Pagination metadata', type: PaginationMeta })
  meta!: PaginationMeta;

  constructor(data: T[], page: number, limit: number, total: number) {
    this.data = data;
    this.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasPrevious: page > 1,
      hasNext: page < Math.ceil(total / limit),
    };
  }
}

/**
 * Helper function to create paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResponse<T> {
  return new PaginatedResponse(data, page, limit, total);
}
