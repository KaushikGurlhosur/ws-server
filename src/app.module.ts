import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [ChatGateway],
})
export class AppModule {}
