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

// ─── 🟢 VALIDATION & ARR-NORMALIZATION INTERCEPTOR ───────────────────
ConversationSchema.pre(
  'validate',
  function (this: any, next: (err?: any) => void) {
    // Normalize fields to arrays to prevent crash vulnerabilities if incoming payload sets them to null/undefined
    const participants = Array.isArray(this.participants)
      ? this.participants
      : [];
    this.participants = participants;

    const participantSettings = Array.isArray(this.participantSettings)
      ? this.participantSettings
      : [];
    this.participantSettings = participantSettings;

    if (this.chatType === 'User') {
      const participantIds = participants
        .map((p: any) => p?.toString())
        .filter(Boolean);

      // Check that there are exactly 2 participants AND they are distinct users
      if (participantIds.length !== 2 || new Set(participantIds).size !== 2) {
        return next(
          new Error(
            'User-to-User conversations must have exactly 2 distinct participants',
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
      if (participants.length < 1) {
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

    const settingsUserIds = participantSettings.map((setting: any) =>
      setting.user?.toString(),
    );

    if (settingsUserIds.some((id: string | undefined) => !id)) {
      return next(
        new Error(
          'Database Integrity Error: participantSettings contains entries missing a user field',
        ),
      );
    }

    const uniqueSettingsUsers = new Set(settingsUserIds);
    if (settingsUserIds.length !== uniqueSettingsUsers.size) {
      return next(
        new Error(
          'Vulnerability Blocked: Duplicate user configurations detected inside settings array',
        ),
      );
    }

    const coreRoomParticipantIds = participants.map((p: any) => p.toString());
    const participantSet = new Set(coreRoomParticipantIds);

    for (const userId of settingsUserIds) {
      if (!participantSet.has(userId)) {
        return next(
          new Error(
            'Data Leak Blocked: participantSettings contains an inactive member ID',
          ),
        );
      }
    }

    next();
  },
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
