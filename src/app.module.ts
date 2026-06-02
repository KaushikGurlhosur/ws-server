import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './schemas/user.schema';
import { MessageSchema } from './schemas/message.schema';
import { GroupSchema } from './schemas/group.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI as string),
    // This is where NestJS compiles your schemas into models!
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Message', schema: MessageSchema },
      { name: 'Group', schema: GroupSchema },
    ]),
  ],
  providers: [ChatGateway],
})
export class AppModule {}
