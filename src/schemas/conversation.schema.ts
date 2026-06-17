import * as mongoose from 'mongoose';

export const ConversationSchema = new mongoose.Schema(
  {
    chatType: {
      type: String,
      enum: ['User', 'Group'],
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    groupRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      default: null,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: {
      type: Date,
    },
    participantSettings: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        unreadCount: {
          type: Number,
          default: 0,
        },
        isMuted: {
          type: Boolean,
          default: false,
        },
        aiAutopilot: {
          mode: {
            type: String,
            enum: ['off', 'partial', 'full'],
            default: 'off',
          },
          persona: {
            type: String,
            enum: ['friendly', 'professional', 'flirty', 'cryptic'],
            default: 'friendly',
          },
          contextWindow: {
            type: Number,
            default: 20,
            min: [1, 'contextWindow must be at least 1 message'],
            max: [200, 'contextWindow cannot exceed 200 messages'],
          },
        },
      },
    ],
  },
  { timestamps: true },
);

// ─── 🟢 BRANCH-SCOPED ISOLATION COMPLIANCE INTERCEPTOR ───────────────────
ConversationSchema.pre(
  'validate',
  function (this: any, next: (err?: any) => void) {
    // 1. Isolate type specific requirements to eliminate mutually exclusive locks
    if (this.chatType === 'User') {
      if (this.participants.length !== 2) {
        return next(
          new Error(
            'User-to-User conversations must have exactly 2 participants',
          ),
        );
      }
      if (this.groupRef) {
        return next(
          new Error(
            'Direct User conversations cannot contain a groupRef index',
          ),
        );
      }
    } else if (this.chatType === 'Group') {
      if (this.participants.length < 1) {
        return next(
          new Error(
            'Group conversations must contain at least 1 active participant',
          ),
        );
      }
      if (!this.groupRef) {
        return next(
          new Error(
            'Group type conversations require a valid groupRef binding object',
          ),
        );
      }
    }

    // 2. Defensive mapping via optional chaining protects against empty arrays or null records
    const settingsUserIds = this.participantSettings.map((setting: any) =>
      setting.user?.toString(),
    );

    if (settingsUserIds.some((id: string | undefined) => !id)) {
      return next(
        new Error(
          'Database Integrity Error: participantSettings contains entries missing a user definition field',
        ),
      );
    }

    // 3. Mathematical Duplicate Invariant Protection
    const uniqueSettingsUsers = new Set(settingsUserIds);
    if (settingsUserIds.length !== uniqueSettingsUsers.size) {
      return next(
        new Error(
          'Vulnerability Blocked: Duplicate user configurations detected inside participantSettings array',
        ),
      );
    }

    // 4. Room Membership Boundary Verifications
    const coreRoomParticipantIds = this.participants.map((p: any) =>
      p.toString(),
    );
    const participantSet = new Set(coreRoomParticipantIds);

    for (const userId of settingsUserIds) {
      if (!participantSet.has(userId)) {
        return next(
          new Error(
            'Data Leak Blocked: participantSettings contains a user ID who is not an active member of this thread',
          ),
        );
      }
    }

    next();
  },
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
