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

@WebSocketGateway({ cors: true }) // 🟢 CORS is active and allowing Vercel to connect!
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Memory map to track who is online right now
  private clients = new Map<string, WebSocket>();

  constructor(
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Message') private messageModel: Model<any>,
    @InjectModel('Group') private groupModel: Model<any>,
  ) {}

  // ==========================================
  // 1. HANDLE CONNECTIONS (The Waiting Room)
  // ==========================================
  async handleConnection(client: WebSocket) {
    // 🟢 CHANGED: We do nothing here now!
    // We let them connect securely, but they are completely anonymous
    // and cannot send messages until they trigger the 'authenticate' event below.
    console.log(
      '👀 Anonymous socket connected, waiting for secure handshake...',
    );
  }

  // ==========================================
  // 1.5. THE SECURE HANDSHAKE (Production Auth)
  // ==========================================
  @SubscribeMessage('authenticate')
  async handleAuthentication(
    @MessageBody() data: any,
    @ConnectedSocket() client: WebSocket,
  ) {
    try {
      const { token } = data;
      if (!token) throw new Error('No token provided');

      // 1. Verify the token securely
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as any;

      if (!decoded.isWsTicket) {
        throw new Error('Invalid token type used for WebSocket');
      }

      const userId = String(decoded.userId);

      // 2. Mark them as officially online in memory
      this.clients.set(userId, client);
      console.log(
        `✅ User ${userId} authenticated. Total Online: ${this.clients.size}`,
      );

      // 3. Update MongoDB
      await this.userModel.findByIdAndUpdate(userId, {
        status: 'Online',
        lastSeen: new Date(),
      });

      // 4. Broadcast to everyone else
      this.broadcastOnlineStatus(userId, true);
    } catch (error) {
      console.log('❌ Authentication failed: Invalid token');
      client.close(1008, 'Unauthorized'); // Kick them out if token is fake
    }
  }

  // ==========================================
  // 2. HANDLE DISCONNECTS
  // ==========================================
  async handleDisconnect(client: WebSocket) {
    const userId = this.getUserIdFromSocket(client);
    if (!userId) return; // If an unauthenticated user leaves, do nothing

    this.clients.delete(userId);
    console.log(`❌ User ${userId} left. Remaining: ${this.clients.size}`);

    await this.userModel.findByIdAndUpdate(userId, {
      status: 'Offline',
      lastSeen: new Date(),
    });

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

    // 🟢 SECURITY: If senderId is null (they never authenticated), this instantly blocks the message!
    if (!senderId || !receiverId || !content.trim()) return;

    const newMessage = await this.messageModel.create({
      chatType: 'User',
      sender: senderId,
      receiver: receiverId,
      content: content.trim(),
      replyTo: replyTo || null,
      status: 'sent',
    });

    const populated = await newMessage.populate(
      'sender receiver',
      'name avatar username',
    );

    const recipientSocket = this.clients.get(receiverId);

    if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
      recipientSocket.send(
        JSON.stringify({ type: 'new_message', message: populated }),
      );

      // 🟢 ADD THIS: Tell the sender the message was instantly delivered!
      client.send(
        JSON.stringify({
          type: 'message_delivered',
          messageId: newMessage._id,
        }),
      );

      newMessage.status = 'delivered';
      newMessage.deliveredAt = new Date();
      await newMessage.save();
    }

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

    const newMessage = await this.messageModel.create({
      chatType: 'Group',
      sender: senderId,
      receiver: groupId,
      content: content.trim(),
      deliveryStatus: group.members
        .filter((m: any) => m.user.toString() !== senderId)
        .map((m: any) => ({ user: m.user })),
    });

    const populated = await newMessage.populate(
      'sender',
      'name avatar username',
    );
    const onlineInGroup: any[] = [];

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

    if (onlineInGroup.length > 0) {
      await this.messageModel.updateOne(
        { _id: newMessage._id },
        { $set: { 'deliveryStatus.$[elem].deliveredAt': new Date() } },
        { arrayFilters: [{ 'elem.user': { $in: onlineInGroup } }] },
      );
    }

    await this.groupModel.findByIdAndUpdate(groupId, {
      lastMessage: newMessage._id,
    });

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
      // 1. Update the database
      const updatedMsg = await this.messageModel.findByIdAndUpdate(messageId, {
        status: 'read',
        readAt: new Date(),
      });

      // 🟢 ADD THIS: Find the person who originally sent the message, and tell them it was read!
      if (updatedMsg) {
        const originalSenderSocket = this.clients.get(
          updatedMsg.sender.toString(),
        );
        if (
          originalSenderSocket &&
          originalSenderSocket.readyState === WebSocket.OPEN
        ) {
          originalSenderSocket.send(
            JSON.stringify({ type: 'read_receipt', messageId: messageId }),
          );
        }
      }
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
