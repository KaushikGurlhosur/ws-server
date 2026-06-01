import * as mongoose from 'mongoose';

export const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String },
    password: { type: String, select: false },
    avatar: { type: String },
    bio: { type: String },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verificationToken: { type: String },

    status: {
      type: String,
      enum: ['Online', 'Offline', 'Auto-Pilot'],
      default: 'Offline',
    },
    autopilotSettings: { type: Object },
    knowledgeBase: { type: Array },

    lastSeen: {
      type: Date,
      default: Date.now,
    },

    security: { type: Object },
    referral: { type: Object },
    preferences: { type: Object },
    billing: { type: Object },
  },
  // strict: false allows Mongoose to read nested objects without defining every single field
  { timestamps: true, strict: false },
);

UserSchema.index({ isVerified: 1 });
