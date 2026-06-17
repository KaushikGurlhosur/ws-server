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
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      sparse: true,
      minLength: [10, 'Phone number too short'],
      maxLength: [15, 'Phone number too long'],
    },
    // We keep the definition so Mongoose knows it exists, but NestJS won't touch it
    password: { type: String, required: true, select: false },
    avatar: {
      type: String,
      default:
        'https://p1.hiclipart.com/preview/203/111/756/account-icon-avatar-icon-person-icon-profile-icon-user-icon-logo-symbol-circle-blackandwhite-png-clipart.jpg',
    },
    bio: {
      type: String,
      maxLength: 200,
      default: 'Hey there! I am using Neura.',
      trim: true,
    },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verificationToken: { type: String },
    status: {
      type: String,
      enum: ['Online', 'Offline', 'Auto-Pilot'],
      default: 'Offline',
    },
    knowledgeBase: [
      {
        question: String,
        answer: String,
        addedAt: { type: Date, default: Date.now },
      },
    ],
    lastSeen: { type: Date },
    security: {
      visitorId: { type: String, index: true },
      lastLoginIp: String,
      failedAttempts: { type: Number, default: 0 },
      isLocked: { type: Boolean, default: false },
      lockUntil: { type: Date },
      passwordHistory: [
        { hash: String, changedAt: { type: Date, default: Date.now } },
      ],
    },
    referral: {
      code: { type: String },
      referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    preferences: {
      language: { type: String, default: 'en' },
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      notifications: {
        email: { type: Boolean, default: true },
        desktop: { type: Boolean, default: true },
      },
    },
    billing: {
      plan: { type: String, enum: ['Free', 'Pro'], default: 'Free' },
      credits: { type: Number, default: 50 },
    },
  },
  { timestamps: true },
);

UserSchema.index({ isVerified: 1 });

UserSchema.index(
  { 'referral.code': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'referral.code': { $exists: true, $type: 'string' },
    },
  },
);

// 🟢 NOTE: No pre('save') hook, no bcrypt, no crypto.
// NestJS relies completely on Next.js to handle identity generation.
