import mongoose from "mongoose";

const { Schema } = mongoose;

const LeavesSchema = new Schema(
  {
    employeeId: {
      type: String,
      required: true,
    },
    companyId: {
      type: String,
      required: true,
    },
    leaveType: {
      type: String,
      required: true,
    },
    from: {
      type: Date,
    },
    to: {
      type: Date,
    },
    ticketNo: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "approve", "reject", "hold"],
      default: "open",
      required: true,
    },
    reason: {
      type: String,
    },
    source: { type: String, enum: ['manual', 'ai_auto'], default: 'manual' },
    aiSummary: { type: String },
    isTimeoutAutoSubmit: { type: Boolean, default: false },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
    updatedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    statics: {
      async findActiveLeaves(companyId) {
        return await this.find({
          companyId,
          from: { $gte: new Date() },
          $or: [{ status: "open" }, { status: "hold" }],
        });
      },

      async updateStatus(employeeId, ticketNumber, status) {
        return await this.updateOne({ employeeId, ticketNo: Number(ticketNumber) }, { status });
      },

      async findByDate(startDate, endDate, companyId) {
        return await this.find({
          companyId,
          $and: [{ createdAt: { $gte: startDate } }, { createdAt: { $lte: endDate } }],
          $or: [{ status: "open" }, { status: "hold" }],
        });
      },
    },
  }
);

const Leaves = mongoose.model("leaves", LeavesSchema);

export default Leaves;
