import mongoose from "mongoose";

const { Schema } = mongoose;

const fromSchema = new Schema(
  {
    type: {
      type: String,
      default: "admin",
    },
    time: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const toSchema = new Schema(
  {
    priorType: {
      type: String,
      enum: ["employee", "coowner", "newContact"],
    },
    time: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
        type: Date,
    },
    employeeId: {
      type: String,
    },
  },
  { _id: false }
);

const TransferLogsSchema = new Schema({
  status: {
    type: String,
    enum: ["accepted", "rejected", "pending", "cancelled"],
  },
  companyId: {
    type: String,
  },
  from: fromSchema,
  to: toSchema,
});

const TransferLogs = mongoose.model("ownerTransferLogs", TransferLogsSchema);

export default TransferLogs;
