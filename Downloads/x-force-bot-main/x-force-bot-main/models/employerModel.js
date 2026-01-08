import mongoose from 'mongoose';

const { Schema } = mongoose;

const branchSchema = new Schema(
  {
    name: String,
    lat: Number,
    long: Number,
    range: {
      type: Number,
      default: 100,
    },
    id: String,
  },
  { _id: false }
);

const notificationSchema = new Schema(
  {
    checkIn: {
      type: Boolean,
      default: true,
    },
    checkOut: {
      type: Boolean,
      default: true,
    },
    leaveRequest: {
      type: Boolean,
      default: true,
    },
    support: {
      type: Boolean,
      default: true,
    },
    morningReportTime: {
      type: Number,
      default: 39600000,
    },
    monthEndReportTime: {
      type: Number,
      default: 32400000,
    },
    eveningReportTime: {
      type: Number,
      default: 72000000,
    },
  },
  { _id: false }
);

const coownerSchema = new Schema(
  {
    ownerNumber: {
      type: Number,
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
    rights: {
      type: String,
      default: 'reports',
    },
  },
  { _id: false }
);

const DepartmentHeadSchema = new Schema(
  {
    name: { type: String },
    number: { type: Number },
    id: { type: String },
  },
  { _id: false }
);

const DepartmentSchema = new Schema(
  {
    id: {
      type: String,
    },
    name: {
      type: String,
    },
    head: {
      type: DepartmentHeadSchema,
    },
    branch: {
      type: String,
    },
  },
  { _id: false }
);

const EmployerSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    employerNumber: {
      type: Number,
      required: true,
    },
    companyName: {
      type: String,
      required: true,
    },
    companyId: String,
    role: {
      type: String,
      enum: ['admin'],
      default: 'admin',
    },
    coOwners: {
      type: [coownerSchema],
    },
    bufferTime: {
      type: Number,
      required: true,
    },
    branch: {
      type: [branchSchema],
    },
    countryName: {
      type: String,
    },
    countryCode: {
      type: String,
    },
    timeZone: {
      type: String,
    },
    regionName: {
      type: String,
    },
    monthlySickLeave: {
      type: String,
      default: '2',
    },
    casualLeave: {
      type: String,
      default: '2',
    },
    carryForwardLimit: {
      type: String,
      default: '2',
    },
    annualLeave: {
      type: String,
      default: '15',
    },
    departments: { type: [DepartmentSchema], default: [] },
    halfDayPolicy: {
      type: String,
      default: '0',
    },
    registeredOn: {
      type: Date,
      default: Date.now,
    },
    isSubscribed: {
      type: Boolean,
      default: false,
    },
    language: {
      type: String,
      default: 'English',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notifications: notificationSchema,
  },
  {
    statics: {
      async findEmployer(employerNumber, companyId) {
        return await this.findOne({ employerNumber, _id: companyId });
      },
      async updateEmployer(employerNumber, companyId, data) {
        return await this.updateOne(
          { employerNumber, _id: companyId },
          { ...data }
        );
      },
      async updateBranch(employerNumber, companyId, newBranch) {
        return await this.updateOne(
          { employerNumber, _id: companyId },
          { $push: { branch: newBranch } }
        );
      },
      async findBranch(employerNumber, companyId) {
        return await this.findOne(
          { employerNumber, _id: companyId },
          { branch: 1 }
        );
      },
      async findBranchByName(employerNumber, companyId, name) {
        const { branch } = await this.findOne(
          {
            employerNumber,
            _id: companyId,
            'branch.name': name,
          },
          { branch: 1 }
        );
        return branch.filter((branch) => branch.name === name) ?? [];
      },
      async updateNotifications(employerNumber, companyId, notifications) {
        await this.updateOne(
          { employerNumber, _id: companyId },
          { $unset: { notifications: {} } }
        );

        return await this.updateOne(
          { employerNumber, _id: companyId },
          { $set: { notifications } }
        );
      },
      async findNotfications(companyId) {
        return await this.findOne({ _id: companyId }, { notifications: 1 });
      },
    },
  }
);

const Employer = mongoose.model('employer', EmployerSchema);

export default Employer;
