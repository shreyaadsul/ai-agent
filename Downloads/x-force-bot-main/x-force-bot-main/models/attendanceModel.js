import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const logsSchema = new Schema(
  {
    time: {
      type: Date,
    },
    logType: {
      type: String,
      enum: ['text', 'image', 'document', 'video'],
    },
    log: {
      type: String,
    },
  },
  { _id: false }
);

const ShiftSchema = new Schema({
  id: { type: Types.ObjectId },
  name: { type:String },
}, { _id: false })

const creationTypeSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['normal', 'correction'],
      default: 'normal',
    },
    status: {
      type: String,
      enum: ['pending', 'approve', 'reject'],
    },
  },
  { _id: false }
);

const AttendanceSchema = new Schema(
  {
    employeeId: {
      type: String,
      required: true,
    },
    companyId: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
    },
    checkInTime: {
      type: Date,
    },
    checkInCoords: [Number, Number],
    checkInPic: {
      type: String,
    },
    checkOutTime: {
      type: Date,
    },
    checkOutCoords: [Number, Number],
    checkOutPic: {
      type: String,
    },
    timeSpent: {
      type: String,
    },
    status: {
      enum: ['full-day', 'half-day', 'late', 'onTime', 'absent'],
      type: String,
    },
    shift: ShiftSchema,
    creationType: creationTypeSchema,
    logs: [logsSchema],
  },
  {
    timestamps: true,
    statics: {
      async findAttendance(employeeId, companyId) {
        const date = new Date();
        const attendance = await this.find({
          employeeId,
          companyId,
          date: {
            $eq: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          },
        });

        if (attendance.length > 0) {
          return attendance[attendance.length - 1];
        }

        return attendance;
      },

      async findAllByDate(startDate, endDate, companyId) {
        return await this.find({
          companyId,
          $and: [{ date: { $gte: startDate } }, { date: { $lte: endDate } }],
        });
      },

      async findByDate(startDate, endDate, employeeId) {
        return await this.find({
          employeeId,
          $and: [{ date: { $gte: startDate } }, { date: { $lte: endDate } }],
        });
      },

      async findCurrentDateAttendance(companyId) {
        const day = new Date();

        const currentDayStart = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate()
        );
        const currentDayEnd = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          23,
          59,
          59
        );

        return await this.find(
          {
            companyId,
            date: {
              $gte: currentDayStart,
              $lt: currentDayEnd,
            },
          },
          { employeeId: 1 }
        );
      },
    },
  }
);

const Attendance = mongoose.model('attendance', AttendanceSchema);

export default Attendance;
