import mongoose from 'mongoose';

const { Schema } = mongoose;

const locationSchema = new Schema(
  {
    name: { type: String, default: 'Any Location' },
    lat: Number,
    long: Number,
    range: {
      type: Number,
      default: 200,
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
    id: { type: String },
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

// const DepartmentHead2Schema = new Schema(
//   {
//     name: { type: String },
//     number: { type: Number },
//     id: { type: String },
//   },
//   { _id: false }
// );

// const Department2Schema = new Schema(
//   {
//     id: { type: String },
//     departmentName: {
//       type: String,
//     },
//     departmentHead: {
//       type: DepartmentHead2Schema,
//     },
//     branch: {
//       type: String,
//     },
//   },
//   { _id: false }
// );

const EmployeeSchema = new Schema(
  {
    employeeName: {
      type: String,
      required: true,
    },
    employeeNumber: {
      type: Number,
      required: true,
    },
    companyId: {
      type: String,
      required: true,
    },
    companyName: {
      type: String,
      required: true,
    },
    employerNumber: {
      type: Number,
      required: true,
    },
    role: {
      type: String,
      enum: ['employee', 'coowner', 'hod'],
      default: 'employee',
    },
    rights: {
      type: [String],
      enum: ['reports'],
    },
    checkIn: {
      type: Date,
    },
    checkOut: {
      type: Date,
    },
    requiredHours: {
      type: Date,
    },
    shiftType: {
      type: String,
      default: 'day',
      enum: ['day', 'day/night'],
    },
    bufferTime: {
      type: Number,
      default: 15,
      required: true,
    },
    language: {
      type: String,
      default: 'English',
    },
    locations: {
      type: [locationSchema],
      default: () => [{ name: 'Any Location' }],
    },
    natureOfTime: {
      type: String,
      default: 'Flexible',
      enum: ['Flexible', 'Fixed'],
    },
    isActive: {
      type: Boolean,
      default: true,
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
    workSchedule: {
      startTime: { type: String, default: "09:00" }, // 24h format
      endTime: { type: String, default: "18:00" },
      timezone: { type: String, default: "Asia/Kolkata" }
    },
    geoFencing: {
      enabled: { type: Boolean, default: true },
      centerLat: { type: Number },
      centerLong: { type: Number },
      radiusMeters: { type: Number, default: 200 }
    },
    lastCheckInPrompt: { type: Date },
    designation: {
      type: String,
    },
    department: { type: [DepartmentSchema], default: [] },
    // dept: { type: [Department2Schema], default: [] },
    joiningDate: {
      type: Date,
    },
    dateOfBirth: {
      type: Date,
    },
    workDays: {
      type: [
        {
          type: Number,
          min: 0,
          max: 6,
        },
      ],
      validate: {
        validator: function (arr) {
          return arr.length <= 7;
        },
        message: 'Array length must be at most 7.',
      },
      default: [1, 2, 3, 4, 5],
    },
    proof: {
      location: {
        type: Boolean,
        default: true,
      },
      image: {
        type: Boolean,
        default: true,
      },
      logs: {
        type: Boolean,
        default: true,
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    statics: {
      async findEmployees(companyId) {
        return await this.find({ companyId, isActive: true });
      },
      async findEmployeedetails(employeeNumber, companyId) {
        return await this.find({ employeeNumber, companyId, isActive: true });
      },
      async findLocations(employerNumber, companyId) {
        const employees = await this.find(
          { employerNumber, companyId, isActive: true },
          { locations: 1 }
        );
        const locations = new Set();

        employees.forEach((employee) => {
          employee.locations.forEach((location) => {
            if (location.name !== 'Any Location') {
              locations.add(location.name);
            }
          });
        });

        return [...locations];
      },
      async updateLocations(employeeNumber, companyId, newLocation) {
        return await this.updateOne(
          { employeeNumber, companyId, isActive: true },
          { $push: { locations: { ...newLocation } } }
        );
      },
      async updateLocationsAndTime(
        employerNumber,
        companyId,
        newLocation,
        natureOfTime
      ) {
        return await this.updateOne(
          { employerNumber, companyId, isActive: true },
          {
            natureOfTime,
            $push: { locations: { name: newLocation.name } },
          }
        );
      },
      async findLocationsAndEmployees(employerNumber, companyId) {
        const employees = await this.find(
          { employerNumber, companyId, isActive: true },
          {
            employeeName: 1,
            employeeNumber: 1,
            checkIn: 1,
            locations: 1,
            checkOut: 1,
            natureOfTime: 1,
          }
        );

        const locations = new Set();

        employees.forEach((employee) => {
          employee.locations.forEach((location) => {
            if (location.name !== 'Any Location') {
              locations.add(location.name);
            }
          });
        });

        return { locations: [...locations], employees };
      },
      async updateEmployeeStatus(employeeNumber, companyId) {
        return await this.updateOne(
          {
            employeeNumber: Number(employeeNumber),
            companyId,
          },
          { $set: { isActive: false } }
        );
      },
      async removeBranchFromEmployees(
        branch,
        employeeNumber,
        employerNumber,
        companyId
      ) {
        return await this.updateOne(
          { employeeNumber, employerNumber, companyId, isActive: true },
          {
            $pull: { locations: { name: { $in: branch } } },
          }
        );
      },
    },
  }
);

const Employee = mongoose.model('employee', EmployeeSchema);

export async function getCompanyEmployees(employerNumber, companyId) {
  const employees = await Employee.find({
    employerNumber,
    companyId,
    isActive: true,
  });

  return employees ?? [];
}

export default Employee;
