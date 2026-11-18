import { ResponseInterceptor } from './response.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<any>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  it('should wrap raw object into { success: true, data }', (done) => {
    const context = {} as ExecutionContext;
    const callHandler: CallHandler = {
      handle: () => of({ name: 'Boro Rice', price: 45 }),
    };

    interceptor.intercept(context, callHandler).subscribe((result) => {
      expect(result).toEqual({
        success: true,
        data: { name: 'Boro Rice', price: 45 },
      });
      done();
    });
  });

  it('should not double-wrap if response already has success property', (done) => {
    const context = {} as ExecutionContext;
    const callHandler: CallHandler = {
      handle: () => of({ success: true, data: [1, 2, 3] }),
    };

    interceptor.intercept(context, callHandler).subscribe((result) => {
      expect(result).toEqual({
        success: true,
        data: [1, 2, 3],
      });
      done();
    });
  });

  it('should not wrap string output (e.g. CSV reports)', (done) => {
    const context = {} as ExecutionContext;
    const csvContent = 'id,name\n1,Rice';
    const callHandler: CallHandler = {
      handle: () => of(csvContent),
    };

    interceptor.intercept(context, callHandler).subscribe((result) => {
      expect(result).toBe(csvContent);
      done();
    });
  });
});
