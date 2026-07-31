import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import compression from 'compression';

import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });


app.enableCors({
  origin: true,
  credentials: true,
});

// const origins = (process.env.CORS_ORIGINS || '')
//   .split(',')
//   .map(origin => origin.trim())
//   .filter(Boolean);

// app.enableCors({
//   origin: origins,
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
// });


  // Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

// Compress HTTP responses
app.use(compression());



  app.useLogger(app.get(Logger));
  
  app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
 app.useGlobalFilters(new HttpExceptionFilter());
const config = new DocumentBuilder()
  .setTitle('ChashiBhai API')
  .setDescription('Backend API for ChashiBhai B2B Agri Marketplace')
  .setVersion('1.0.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);

SwaggerModule.setup('api', app, document);
  await app.listen(process.env.PORT ?? 3000);
   console.log(`🚀 Server: http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`📘 Swagger: http://localhost:${process.env.PORT ?? 3000}/api`);
}
bootstrap();
