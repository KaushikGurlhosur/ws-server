import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Tell Nest to use native WebSockets (ws)
  app.useWebSocketAdapter(new WsAdapter(app));

  // 🟢 CHANGED: Grab Render's dynamic port, fallback to 3001 locally.
  // We MUST bind to '0.0.0.0' so Render's port scanner can find it!
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  console.log('🚀 NestJS WebSocket Server running on ws://localhost:3001');
}
bootstrap();
