import {
  HttpExceptionFilter,
  GlobalExceptionFilter,
} from './http-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
    expect(new GlobalExceptionFilter()).toBeDefined();
  });

  it('should format HttpException into standard error response', () => {
    const statusFn = jest.fn().mockReturnThis();
    const jsonFn = jest.fn();

    const mockResponse = {
      status: statusFn,
      json: jsonFn,
    };

    const mockRequest = {
      method: 'GET',
      url: '/api/v1/products',
    };

    const mockHost: ArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    const exception = new HttpException(
      'Resource not found',
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, mockHost);

    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Resource not found',
        statusCode: 404,
        path: '/api/v1/products',
      }),
    );
  });
});
