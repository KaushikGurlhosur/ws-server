// import {
//   WebSocketGateway,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
// } from '@nestjs/websockets';
// import { WebSocket } from 'ws';

// // Allow Next.js (port 3000) to connect
// @WebSocketGateway({ cors: true })
// export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
//   handleConnection(client: WebSocket, ...args: any[]) {
//     console.log('✅ Someone connected to the WebSocket!');

//     // Send a welcome message back to the Next.js client
//     client.send(
//       JSON.stringify({ type: 'welcome', message: 'Hello from NestJS!' }),
//     );
//   }

//   handleDisconnect(client: WebSocket) {
//     console.log('❌ Someone disconnected.');
//   }
// }

import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import * as jwt from 'jsonwebtoken';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Memory map to track who is online right now
  private clients = new Map<string, WebSocket>();

  // 🟢 INJECTION: We tell NestJS to hand us the MongoDB models we created
  constructor(
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Message') private messageModel: Model<any>,
    @InjectModel('Group') private groupModel: Model<any>,
  ) {}

  // ==========================================
  // 1. HANDLE CONNECTIONS (The Bouncer)
  // ==========================================
  async handleConnection(client: WebSocket, ...args: any[]) {
    const request = args[0];

    try {
      // 1. Grab the secure httpOnly cookie set by Next.js
      const cookieHeader = request.headers.cookie || '';
      const token = cookieHeader
        .split(';')
        .find((c) => c.trim().startsWith('token='))
        ?.split('=')[1];

      if (!token) throw new Error('No cookie token found');

      // 2. Verify the token using the shared secret
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as any;
      const userId = String(decoded.userId);

      // 3. Mark them as online in memory and in MongoDB
      this.clients.set(userId, client);
      console.log(
        `✅ User ${userId} joined. Total Online: ${this.clients.size}`,
      );

      await this.userModel.findByIdAndUpdate(userId, {
        status: 'Online',
        lastSeen: new Date(),
      });

      // 4. Tell everyone else they are online
      this.broadcastOnlineStatus(userId, true);
    } catch (error) {
      console.log('❌ Connection rejected: Unauthorized');
      client.close(1008, 'Unauthorized');
    }
  }

  // ==========================================
  // 2. HANDLE DISCONNECTS
  // ==========================================
  async handleDisconnect(client: WebSocket) {
    const userId = this.getUserIdFromSocket(client);
    if (!userId) return;

    // Remove from memory
    this.clients.delete(userId);
    console.log(`❌ User ${userId} left. Remaining: ${this.clients.size}`);

    // Update MongoDB
    await this.userModel.findByIdAndUpdate(userId, {
      status: 'Offline',
      lastSeen: new Date(),
    });

    // Broadcast offline status
    this.broadcastOnlineStatus(userId, false);
  }

  // ==========================================
  // 3. 1-ON-1 MESSAGING
  // ==========================================
  @SubscribeMessage('private_message')
  async handlePrivateMessage(
    @MessageBody() data: any,
    @ConnectedSocket() client: WebSocket,
  ) {
    const { receiverId, content, replyTo, tempId } = data;
    const senderId = this.getUserIdFromSocket(client);
    if (!senderId || !receiverId || !content.trim()) return;

    // 1. Save message to MongoDB
    const newMessage = await this.messageModel.create({
      chatType: 'User',
      sender: senderId,
      receiver: receiverId,
      content: content.trim(),
      replyTo: replyTo || null,
      status: 'sent',
    });

    // Populate sender details for the frontend UI
    const populated = await newMessage.populate(
      'sender receiver',
      'name avatar username',
    );

    // 2. Check if the receiver is online right now
    const recipientSocket = this.clients.get(receiverId);

    if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
      // Send it live!
      recipientSocket.send(
        JSON.stringify({ type: 'new_message', message: populated }),
      );

      // Update DB to show it was instantly delivered
      newMessage.status = 'delivered';
      newMessage.deliveredAt = new Date();
      await newMessage.save();
    }

    // 3. Confirm back to the sender so their UI updates from "pending" to "sent"
    client.send(
      JSON.stringify({
        type: 'message_sent_confirm',
        message: populated,
        tempId: tempId,
      }),
    );
  }

  // ==========================================
  // 4. GROUP MESSAGING
  // ==========================================
  @SubscribeMessage('group_message')
  async handleGroupMessage(
    @MessageBody() data: any,
    @ConnectedSocket() client: WebSocket,
  ) {
    const { groupId, content, tempId } = data;
    const senderId = this.getUserIdFromSocket(client);
    if (!senderId || !groupId || !content.trim()) return;

    const group = await this.groupModel.findById(groupId);
    if (!group) return;

    // 1. Save to MongoDB
    const newMessage = await this.messageModel.create({
      chatType: 'Group',
      sender: senderId,
      receiver: groupId,
      content: content.trim(),
      // Prepare delivery tracking for everyone except the sender
      deliveryStatus: group.members
        .filter((m: any) => m.user.toString() !== senderId)
        .map((m: any) => ({ user: m.user })),
    });

    const populated = await newMessage.populate(
      'sender',
      'name avatar username',
    );
    const onlineInGroup: any[] = [];

    // 2. Broadcast to all group members currently online
    group.members.forEach((member: any) => {
      const memberId = member.user.toString();
      if (memberId === senderId) return;

      const memberSocket = this.clients.get(memberId);
      if (memberSocket && memberSocket.readyState === WebSocket.OPEN) {
        onlineInGroup.push(member.user);
        memberSocket.send(
          JSON.stringify({
            type: 'group_message',
            message: populated,
            groupId,
          }),
        );
      }
    });

    // 3. Update delivery timestamps in bulk for those who were online
    if (onlineInGroup.length > 0) {
      await this.messageModel.updateOne(
        { _id: newMessage._id },
        { $set: { 'deliveryStatus.$[elem].deliveredAt': new Date() } },
        { arrayFilters: [{ 'elem.user': { $in: onlineInGroup } }] },
      );
    }

    // Update the group's "lastMessage" preview
    await this.groupModel.findByIdAndUpdate(groupId, {
      lastMessage: newMessage._id,
    });

    // 4. Confirm back to sender
    client.send(
      JSON.stringify({
        type: 'message_sent_confirm',
        message: populated,
        tempId: tempId,
        groupId: groupId,
      }),
    );
  }

  // ==========================================
  // 5. TYPING INDICATORS
  // ==========================================
  @SubscribeMessage('typing')
  handleTyping(@MessageBody() data: any, @ConnectedSocket() client: WebSocket) {
    const { receiverId, groupId, isTyping } = data;
    const senderId = this.getUserIdFromSocket(client);
    if (!senderId) return;

    if (receiverId) {
      const recipient = this.clients.get(receiverId);
      if (recipient && recipient.readyState === WebSocket.OPEN) {
        recipient.send(
          JSON.stringify({ type: 'typing', userId: senderId, isTyping }),
        );
      }
    } else if (groupId) {
      this.clients.forEach((socket, userId) => {
        if (userId !== senderId && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'group_typing',
              groupId,
              userId: senderId,
              isTyping,
            }),
          );
        }
      });
    }
  }

  // ==========================================
  // 6. READ RECEIPTS
  // ==========================================
  @SubscribeMessage('read_receipt')
  async handleReadReceipt(
    @MessageBody() data: any,
    @ConnectedSocket() client: WebSocket,
  ) {
    const { messageId, chatType } = data;
    const userId = this.getUserIdFromSocket(client);
    if (!userId) return;

    if (chatType === 'User') {
      await this.messageModel.findByIdAndUpdate(messageId, {
        status: 'read',
        readAt: new Date(),
      });
    } else {
      await this.messageModel.updateOne(
        { _id: messageId, 'deliveryStatus.user': userId },
        { $set: { 'deliveryStatus.$.readAt': new Date() } },
      );
    }
  }

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================
  private getUserIdFromSocket(client: WebSocket): string | null {
    for (const [userId, socket] of this.clients.entries()) {
      if (socket === client) return userId;
    }
    return null;
  }

  private broadcastOnlineStatus(userId: string, isOnline: boolean) {
    const payload = JSON.stringify({
      type: 'status_update',
      userId,
      isOnline,
      lastSeen: new Date(),
    });

    this.clients.forEach((clientSocket, clientId) => {
      if (clientId !== userId && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(payload);
      }
    });
  }
}
