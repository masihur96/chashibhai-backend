import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: boolean;
  data: T;
  meta?: any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  StandardResponse<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        // Do not wrap if response is a CSV string, file buffer, or stream
        if (typeof data === 'string' || Buffer.isBuffer(data)) {
          return data;
        }

        // If response is already standard format { success: true/false, ... }
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Standard wrapping
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
