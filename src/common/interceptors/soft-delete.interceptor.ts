import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Soft Delete Interceptor
 * Filters out soft-deleted records (where deletedAt is not null)
 */
@Injectable()
export class SoftDeleteInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (Array.isArray(data)) {
          return data.filter((item) => !item.deletedAt);
        }

        if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
          // Handle paginated responses
          return {
            ...data,
            data: data.data.filter((item: any) => !item.deletedAt),
          };
        }

        return data;
      }),
    );
  }
}
