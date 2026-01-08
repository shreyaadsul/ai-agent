import mongoose from "mongoose";

const { Schema } = mongoose;

const issueSchema = new Schema(
  {
    employeeId: {
      type: String,
    },
    companyId: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
    },
    issueType: {
      type: String,
      required: true,
    },
    remark: {
      type: String,
    },
    ticketNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "closed", "hold", "reject", "resolve"],
      default: "open",
    },
  },
  {
    statics: {
      async findActive(companyId) {
        return await this.find({
          companyId,
          date: { $lte: new Date() },
          $or: [{ status: "open" }, { status: "hold" }],
        });
      },
      async updateStatus(ticketNumber, status, employeeId) {
        return await this.updateOne({ ticketNumber: Number(ticketNumber), employeeId }, { status });
      },
    },
  }
);

const Issue = mongoose.model("Issue", issueSchema);

export default Issue;
