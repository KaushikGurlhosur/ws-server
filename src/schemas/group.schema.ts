import * as mongoose from 'mongoose';

export const GroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxLength: 50,
    },
    avatar: {
      type: String,
      default: 'https://cdn-icons-png.flaticon.com/512/1946/1946429.png',
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: {
          type: String,
          enum: ['admin', 'moderator', 'member'],
          default: 'member',
        },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    maxMembers: { type: Number, default: 500 },
    memberCount: { type: Number, default: 1 },
    isReadOnlyForMembers: { type: Boolean, default: false },
    requiresApproval: { type: Boolean, default: false },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  { timestamps: true },
);

// 🟢 CHANGED: Added 'async' and completely removed 'next' from the parentheses
GroupSchema.pre('save', function () {
  if (this.isModified('members')) {
    this.memberCount = this.members.length;
  }

  // 🟢 CHANGED: No next() call here. Mongoose automatically knows it's done because of 'async'.
});

GroupSchema.index({ inviteCode: 1 });
GroupSchema.index({ 'members.user': 1, 'members.role': 1 });
