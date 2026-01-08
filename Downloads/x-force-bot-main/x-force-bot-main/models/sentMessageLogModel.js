import mongoose from 'mongoose';

const sentMessageLogSchema = new mongoose.Schema(
  {
    recipientPhone: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      required: true,
    },
    messageType: {
      type: String,
      required: true,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const SentMessageLog = mongoose.model('SentMessageLog', sentMessageLogSchema);

export default SentMessageLog;
