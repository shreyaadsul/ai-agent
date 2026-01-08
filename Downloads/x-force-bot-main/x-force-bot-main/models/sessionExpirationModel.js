import mongoose from 'mongoose';

const sessionExpirationSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },
    sessionDate: {
      type: String,
      required: true,
    },
    expirationTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

sessionExpirationSchema.index({ phone: 1, sessionDate: 1 }, { unique: true });

const SessionExpiration = mongoose.model(
  'SessionExpiration',
  sessionExpirationSchema
);

export default SessionExpiration;
