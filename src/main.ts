import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Transport, TcpOptions, RmqOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const useTcp = process.env.MS_TRANSPORT === 'TCP';
const HTTP_PORT = Number(process.env.SERVICE_PORT || 3104);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const useTcp = process.env.MS_TRANSPORT === 'TCP';
  if (useTcp) {
    app.connectMicroservice<TcpOptions>({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: 4050 },
    });
  }

  await app.startAllMicroservices();

  const cfg = new DocumentBuilder()
    .setTitle('appointments-svc (internal)')
    .setVersion('1.0.0')
    .build();
  const doc = SwaggerModule.createDocument(app, cfg, { deepScanRoutes: true });
  SwaggerModule.setup('docs', app, doc);

  await app.listen(HTTP_PORT);
}
bootstrap();
