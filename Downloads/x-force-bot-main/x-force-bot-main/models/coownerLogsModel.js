import mongoose from "mongoose";

const { Schema } = mongoose;

const fromSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["admin", "coowner"],
    },
    time: {
      type: Date,
      default: Date.now,
    },
    employeeId: {
      type: String,
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

const CoownerLogsSchema = new Schema({
  status: {
    type: String,
    enum: ["accepted", "rejected", "pending"],
  },
  companyId: {
    type: String,
  },
  from: fromSchema,
  to: toSchema,
});

const CoownerLogs = mongoose.model("coownerLogs", CoownerLogsSchema);

export default CoownerLogs;
