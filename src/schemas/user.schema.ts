import * as mongoose from 'mongoose';

export const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: {
      type: String,
      unique: true,
      required: [true, 'User name is required'],
      minLength: [3, 'Username must be at least 3 characters'],
      maxLength: [30, 'Username cannot exceed 30 characters'],
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._]+$/,
        'Username can only contain letters, numbers, dots, and underscores',
      ],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: [true, 'Email must be Unique'],
      trim: true,
      lowercase: true,
    },
    phoneNumber: { type: String, unique: true },
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
    autopilotSettings: {
      mode: {
        type: String,
        enum: ['Professional', 'Flirt', 'Friendly', 'Off'],
        default: 'Off',
      },
      contextWindow: {
        type: Number,
        default: 48, // Default to 48 hours
      },
      isLearning: { type: Boolean, default: true },
    },
    knowledgeBase: [
      {
        question: String,
        answer: String,
        addedAt: { type: Date, default: Date.now },
      },
    ],

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
