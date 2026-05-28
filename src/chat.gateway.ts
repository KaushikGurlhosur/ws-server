import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';

// Allow Next.js (port 3000) to connect
@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  handleConnection(client: WebSocket, ...args: any[]) {
    console.log('✅ Someone connected to the WebSocket!');

    // Send a welcome message back to the Next.js client
    client.send(
      JSON.stringify({ type: 'welcome', message: 'Hello from NestJS!' }),
    );
  }

  handleDisconnect(client: WebSocket) {
    console.log('❌ Someone disconnected.');
  }
}
