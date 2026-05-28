import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Tell Nest to use native WebSockets (ws)
  app.useWebSocketAdapter(new WsAdapter(app));

  // Start on port 3001
  await app.listen(3001);

  console.log('🚀 NestJS WebSocket Server running on ws://localhost:3001');
}
bootstrap();
