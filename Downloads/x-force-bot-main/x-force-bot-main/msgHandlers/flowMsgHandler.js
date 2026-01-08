import moment from 'moment-timezone';
import path from 'path';

import {
  Employer,
  Leave,
  Employee,
  Attendance,
  OwnerTransferLogs,
  Issue,
  CoownerLogs,
} from '../models/index.js';
import { getTextMessage, getSimpleButtonsMessage } from '../utils/languages.js';
import {
  sendEmployeeDemoTemplate,
  sendTextMessage,
  sendSimpleButtons,
  sendImage,
  sendDocument,
  sendFlow,
  sendLocationCta,
} from '../utils/messages.js';
import {
  delay,
  calculateWorkingHours,
  timeStringToEpochDate,
  fileExists,
  deleteFile,
  formatTime12h,
  getSixMonthsInMs,
  capitalize,
  dateFromHourStr,
  splitArray,
  calculateMonthRange,
  isCheckIn,
  getFlowMessageData,
  createEmployeeProperties,
  getCurrentDayBounds,
} from '../utils/utils.js';
import {
  createAllEmployeeReport,
  createEmployeeReport,
  createdailySOP,
} from '../pdf_reports_2.js';
import { tryCatch } from '../utils/tryCatch.js';
import flowIds, { FLOW_TOKEN } from '../utils/constants.js';
import {
  createAttendanceReport,
  createHodAttendanceReport,
} from '../pdf_reports_2.js';

const handleFlowMessage = tryCatch(
  async ({ flowMessage, recipientPhone, session }) => {
    const { user, session: sessionType } = session.get(recipientPhone);

    if (flowMessage) {
      flowMessage = JSON.parse(flowMessage);
    }

    const flowName = flowMessage?.flowName;

    if (flowName === 'attendanceManagement') {
      const {
        reports,
        deleteplaces,
        editshift,
        places,
        deleteemployee,
        buseinessSettings,
        createTasks,
        editTimingsByBranch,
        departmentReports
      } = flowMessage;

      const reportAndApprovals = flowMessage['report-approval'];

      if (reports) {
        if (reports === 'yesterdayreport') {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          const isReport = await createAttendanceReport({
            type: 'yesterday',
            recipientPhone,
            companyId: user.companyId,
            language: user.language,
            timeZone: user.timeZone,
            startDate: yesterday,
            endDate: yesterday,
          });

          if (isReport.status) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Live Report',
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (reports === 'currentmonth') {
          const currentDate = moment.tz(new Date(), user.timeZone);

          // const isReport = await createMonthlyReport(currentDate.month(), {
          //   companyId: user.companyId,
          //   timeZone: user.timeZone,
          //   companyName: user.companyName,
          //   companyNumber: recipientPhone,
          //   language: user.language,
          //   halfDayPolicy: user.halfDayPolicy,
          // });

          // const date = new Date()

          const startDate = new Date(
            currentDate.year(),
            currentDate.month(),
            1
          );
          const endDate = new Date(
            currentDate.year(),
            currentDate.month() + 1,
            0
          );

          const isReport = await createAttendanceReport({
            type: 'monthly',
            recipientPhone,
            companyId: user.companyId,
            language: user.language,
            timeZone: user.timeZone,
            startDate,
            endDate,
          });

          if (isReport) {
            await sendDocument({
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Current Month Report',
              recipientPhone,
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          }
        } else if (reports === 'customdaterangepdf') {
          await sendDateRangeFlow(
            user.language,
            user.registeredOn,
            'dateRangeReport',
            recipientPhone
          );
        } else if (reports === 'allEmployees') {
          const isReport = await createAllEmployeeReport(
            recipientPhone,
            user.companyId,
            user.language
          );

          if (isReport.status) {
            await sendDocument({
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}-allEmployeeReport.pdf`
              ),
              caption: 'All Employees Report',
              recipientPhone,
            });
            await deleteFile(`${recipientPhone}-allEmployeeReport.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (reports === 'ShortSummaryReport') {
          await sendDateRangeFlow(
            user.language,
            user.registeredOn,
            'ShortSummaryReport',
            recipientPhone
          );
        }
      }

      if (deleteplaces) {
        if (deleteplaces === 'delete-multiple-places') {
          let { employees } = await Employee.findLocationsAndEmployees(
            recipientPhone,
            user.companyId
          );

          if (!employees || employees.length === 0) {
            employees = {
              employeeList1: [
                {
                  id: 'noEmployees',
                  title: 'No Employees',
                },
              ],
              employeeList2: [
                {
                  id: 'noEmployees',
                  title: '',
                },
              ],
              employeeList3: [
                {
                  id: 'noEmployees',
                  title: '',
                },
              ],
              employeeList4: [
                {
                  id: 'noEmployees',
                  title: '',
                },
              ],
            };
          } else if (employees.length > 0) {
            employees = createEmployeeProperties(employees);
          }

          const message = getTextMessage(user.language, 'remove-branch', []);
          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Remove_Branch',
            data: {
              ...flow,
              branch: [
                { id: 'Any Location', title: 'Any Location' },
                ...user.places.map((place) => ({
                  id: place.name,
                  title: place.name,
                })),
              ],
              ...employees,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Remove',
            flow_data: flowData,
            flow_id: flowIds.removeBranch,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else {
          const deleteBranchName = deleteplaces?.trim();

          const deleteFilters = [];

          if (user?.companyId) {
            deleteFilters.push(
              { companyId: user.companyId },
              { _id: user.companyId }
            );

            if (mongoose.Types.ObjectId.isValid(user.companyId)) {
              deleteFilters.push({
                _id: new mongoose.Types.ObjectId(user.companyId),
              });
            }
          }

          const deleteQuery = {
            employerNumber: Number(recipientPhone),
            'branch.name': deleteBranchName,
          };

          if (deleteFilters.length) {
            deleteQuery.$or = deleteFilters;
          }

          const deleteRes = await Employer.updateOne(deleteQuery, {
            $pull: { branch: { name: deleteBranchName } },
          });

          if (deleteRes && deleteRes.acknowledged) {
            const res = await Employee.updateMany(
              {
                companyId: user.companyId,
                'locations.name': deleteplaces,
              },
              { $pull: { locations: { name: deleteplaces } } },
              { multi: true }
            );

            session.get(recipientPhone).user.places = session
              .get(recipientPhone)
              .user.places.filter((place) => place.name !== deleteplaces);

            if (res) {
              const message = getTextMessage(user.language, 'placeDeleted', []);
              await sendTextMessage(message, recipientPhone);
            }
          } else {
            const message = getTextMessage(
              user.language,
              'placeDeleteFailed',
              []
            );
            await sendTextMessage(message, recipientPhone);
          }
        }
      }

      if (places) {
        if (!Array.isArray(user.places) || user.places.length === 0) {
          const message = getTextMessage(user.language, 'noPlaces', []);
          return await sendTextMessage(message, recipientPhone);
        }

        if (places === 'multiple-edit-palces') {
          const placesList = user.places.map((place) => {
            return {
              id: place.name,
              title: place.name,
              description: `${place.range} meters`,
            };
          });

          const employees = await Employee.findEmployees(user.companyId);
          const formattedEmployees = createEmployeeProperties(employees);

          const message = getTextMessage(user.language, 'edit_geolocation', []);
          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Edit_Geo_Fencing',
            data: {
              ...flow,
              branches: placesList,
              init_values: {
                place: [],
              },
              ...formattedEmployees,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Edit Places',
            flow_data: flowData,
            flow_id: flowIds.editGeo,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else {
          const placesList = [];

          user.places.forEach((place) => {
            if (place.name === places) {
              placesList.push({
                id: place.name,
                title: place.name,
                description: `${place.range} meters`,
              });
            }
          });

          const employees = await Employee.findEmployees(user.companyId);
          const employeeInPlaces = new Set();

          employees.forEach((employee) => {
            const locations = employee.locations;

            if (locations.length > 0) {
              locations.forEach((location) => {
                if (location.name === places.trim()) {
                  employeeInPlaces.add(String(employee.employeeNumber));
                }
              });
            }
          });

          const formattedEmployees = createEmployeeProperties(employees);

          const message = getTextMessage(user.language, 'edit_geolocation', []);
          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Edit_Geo_Fencing',
            data: {
              ...flow,
              branches: placesList,
              init_values: {
                place: [placesList[0].id],
                employees1: [
                  ...formattedEmployees.employeeList1
                    .filter((emp) => employeeInPlaces.has(emp.id))
                    .map((emp) => emp.id),
                ],
                employees2: [
                  ...formattedEmployees.employeeList2
                    .filter((emp) => employeeInPlaces.has(emp.id))
                    .map((emp) => emp.id),
                ],
                employees3: [
                  ...formattedEmployees.employeeList3
                    .filter((emp) => employeeInPlaces.has(emp.id))
                    .map((emp) => emp.id),
                ],
                employees4: [
                  ...formattedEmployees.employeeList4
                    .filter((emp) => employeeInPlaces.has(emp.id))
                    .map((emp) => emp.id),
                ],
              },
              ...formattedEmployees,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Edit Locations',
            flow_data: flowData,
            flow_id: flowIds.editGeo,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        }
      }

      if (deleteemployee) {
        if (deleteemployee === 'delete-multiple-employees') {
          const message = getTextMessage(user.language, 'remove-employees', [
            user.companyName,
          ]);
          const { flow, flowBody } = getFlowMessageData(message);

          let employees = await Employee.findEmployees(user.companyId);

          if (!employees || employees.length === 0) {
            employees = {
              employeeList1: [
                {
                  id: 'noEmployees',
                  title: 'No Employees',
                },
              ],
              employeeList2: [
                {
                  id: 'noEmployees',
                  title: '',
                },
              ],
              employeeList3: [
                {
                  id: 'noEmployees',
                  title: '',
                },
              ],
              employeeList4: [
                {
                  id: 'noEmployees',
                  title: '',
                },
              ],
            };
          } else if (employees.length > 0) {
            employees = createEmployeeProperties(employees);
          }

          const flowData = {
            screen: 'Remove_Employees',
            data: {
              ...flow,
              ...employees,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Remove',
            flow_data: flowData,
            flow_id: flowIds.removeEmployee,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else {
          const res = await Employee.updateEmployeeStatus(
            deleteemployee,
            user.companyId
          );

          if (res && res.acknowledged) {
            const message = getTextMessage(user.language, 'employeeRemove', []);
            await sendTextMessage(message, recipientPhone);
          }
        }
      }

      if (editshift) {
        if (editshift === 'multiple-edit-shift') {
          const employees = await Employee.findEmployees(user.companyId);

          if (employees) {
            const empProps = createEmployeeProperties(employees);

            const message = getTextMessage(user.language, 'edit-timings', []);
            const { flow, flowBody } = getFlowMessageData(message);

            const flowData = {
              screen: 'Edit_Timings',
              data: {
                ...flow,
                init_values: {
                  workinghours: '09:00',
                  checkin: '09:30',
                  checkout: '18:30',
                  // workdays: [...employees.workDays.map(String)],
                },
                ...empProps,
              },
            };

            await sendFlow({
              body: flowBody,
              flow_cta: 'Edit Timings',
              flow_data: flowData,
              flow_id: flowIds.editShift,
              flow_token: FLOW_TOKEN,
              recipientPhone,
            });
          }
        } else {
          const employee = await Employee.findOne({
            companyId: user.companyId,
            employeeNumber: Number(editshift),
            isActive: true,
          });

          if (employee) {
            const empProps = createEmployeeProperties([employee]);

            const checkin = new Date(employee.checkIn).toLocaleTimeString(
              'en-GB',
              {
                timeZone: employee.timeZone,
                hour: '2-digit',
                minute: '2-digit',
              }
            );
            const checkout = new Date(employee.checkOut).toLocaleTimeString(
              'en-GB',
              {
                timeZone: employee.timeZone,
                hour: '2-digit',
                minute: '2-digit',
              }
            );

            const message = getTextMessage(user.language, 'edit-timings', []);
            const { flow, flowBody } = getFlowMessageData(message);

            const flowData = {
              screen: 'Edit_Timings',
              data: {
                ...flow,
                init_values: {
                  timing: employee.natureOfTime,
                  shiftType: employee.shiftType,
                  checkin,
                  checkout,
                  workdays: [...employee.workDays.map(String)],
                  employees1: [String(employee.employeeNumber)],
                },
                ...empProps,
              },
            };
            await sendFlow({
              body: flowBody,
              flow_cta: 'Edit Timings',
              flow_data: flowData,
              flow_id: flowIds.editShift,
              flow_token: FLOW_TOKEN,
              recipientPhone,
            });
          }
        }
      }

      if (reportAndApprovals) {
        if (reportAndApprovals === 'livereport') {
          const isReport = await createAttendanceReport({
            type: 'live',
            recipientPhone,
            companyId: user.companyId,
            language: user.language,
            timeZone: user.timeZone,
          });

          if (isReport.status) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Live Report',
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (reportAndApprovals === 'leaveApprovals') {
          const { registeredOn, timeZone, companyId, language } = user;
          const { monthStart, monthEnd } = calculateMonthRange(
            registeredOn,
            timeZone
          );

          const leaves = await Leave.findByDate(
            monthStart,
            monthEnd,
            companyId
          );
          const employees = await Employee.find(
            { companyId, isActive: true },
            { employeeName: 1, _id: 1 }
          );

          let leavesCheckBox = [];
          if (leaves && leaves.length === 0) {
            const message = getTextMessage(language, 'noLeaveReq', []);
            return await sendTextMessage(message, recipientPhone);
            // return await sendTextMessage("There are no leave requests", recipientPhone);
          } else if (leaves && leaves.length > 0) {
            const result = {
              requestsCheckbox1: [],
              requestsCheckbox2: [],
              requestsCheckbox3: [],
              requestsCheckbox4: [],
              requestsCheckbox5: [],
            };

            const checkboxes = leaves.map((leave) => {
              const employee = employees.find(
                (employee) => employee._id.toString() === leave.employeeId
              );
              const from = moment.tz(leave.from, timeZone);
              const to = moment.tz(leave.to, timeZone);
              return {
                id: leave._id.toString(),
                title: `${employee.employeeName.slice(0, 5)} ${leave.leaveType
                  } ${from.format('DD/MM')} - ${to.format('DD/MM')}`,
              };
            });
            leavesCheckBox = generateCheckboxRequests(
              checkboxes,
              result,
              'requestsCheckbox'
            );
          }

          const message = getTextMessage(
            user.language,
            'leaveApprovalsFlow',
            []
          );
          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Leave_Approvals',
            data: {
              ...flow,
              userData: '',
              init_values: {
                userData: '',
                approveType: 'approve',
                requests1: [...getIds(leavesCheckBox.requestsCheckbox1)],
                requests2: [...getIds(leavesCheckBox.requestsCheckbox2)],
                requests3: [...getIds(leavesCheckBox.requestsCheckbox3)],
                requests4: [...getIds(leavesCheckBox.requestsCheckbox4)],
                requests5: [...getIds(leavesCheckBox.requestsCheckbox5)],
              },
              ...leavesCheckBox,
              // ...message.label,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Requests',
            flow_data: flowData,
            flow_id: flowIds.leaveApproval,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (reportAndApprovals === 'attendanceCorrections') {
          const { registeredOn, timeZone, companyId, language } = user;

          const { monthStart, monthEnd } = calculateMonthRange(
            registeredOn,
            timeZone
          );

          const attendances = await Attendance.find(
            {
              companyId,
              'creationType.status': 'pending',
              $and: [
                { date: { $gte: monthStart } },
                { date: { $lte: monthEnd } },
              ],
            },
            { employeeId: 1, _id: 1, checkInTime: 1, checkOutTime: 1, date: 1 }
          );
          const employees = await Employee.find(
            { companyId, isActive: true },
            { employeeName: 1, timeZone: 1, _id: 1 }
          );

          let attendancesCheckBox = [];
          if (attendances && attendances.length === 0) {
            const message = getTextMessage(language, 'noCorrectionReq', []);
            return await sendTextMessage(message, recipientPhone);
            // return await sendTextMessage(
            //   "There are no attendance correction requests",
            //   recipientPhone
            // );
          } else if (attendances && attendances.length > 0) {
            const result = {
              correctionsChechbox1: [],
              correctionsChechbox2: [],
              correctionsChechbox3: [],
              correctionsChechbox4: [],
              correctionsChechbox5: [],
            };

            const checkboxes = attendances.map((attendance) => {
              const employee = employees.find(
                (employee) => employee._id.toString() === attendance.employeeId
              );

              const checkIn = formatTime12h(
                attendance.checkInTime,
                employee.timeZone
              );
              const checkOut = formatTime12h(
                attendance.checkOutTime,
                employee.timeZone
              );
              const date = moment.tz(attendance.date, employee.timeZone);

              return {
                id: attendance._id.toString(),
                title: `${employee.employeeName}`,
                description: `Date: ${date.format(
                  'DD/MM/YY'
                )}.\nCheck In: ${checkIn}, Check Out: ${checkOut}`,
              };
            });
            attendancesCheckBox = generateCheckboxRequests(
              checkboxes,
              result,
              'correctionsChechbox'
            );
          }
          const message = getTextMessage(
            language,
            'attendanceApprovalFlow',
            []
          );
          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Attendance_Approvals',
            data: {
              userData: 'fd',
              init_values: {
                userData: 'fd',
                approveType: 'approve',
                corrections1: [
                  ...getIds(attendancesCheckBox.correctionsChechbox1),
                ],
                corrections2: [
                  ...getIds(attendancesCheckBox.correctionsChechbox2),
                ],
                corrections3: [
                  ...getIds(attendancesCheckBox.correctionsChechbox3),
                ],
                corrections4: [
                  ...getIds(attendancesCheckBox.correctionsChechbox4),
                ],
                corrections5: [
                  ...getIds(attendancesCheckBox.correctionsChechbox5),
                ],
              },
              ...attendancesCheckBox,
              ...flow,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Requests',
            flow_data: flowData,
            flow_id: flowIds.attCorrection,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (reportAndApprovals === 'broadcast') {
          const employees = await Employee.findEmployees(user.companyId);

          if (Array.isArray(employees) && employees.length > 0) {
            const dynamicFlowData = {
              employeesRadio: employees.map((employee) => ({
                id: String(employee.employeeNumber),
                title: employee.employeeName,
              })),
              userData: flowMessage.userData,
              init_values: {
                userData: flowMessage.userData,
              },
            };

            const [flowData, body] = getFlowData(
              'Broadcast',
              dynamicFlowData,
              user.language,
              'broadcast'
            );

            await sendFlow({
              body,
              flow_cta: 'Broadcast',
              flow_data: flowData,
              flow_id: flowIds.broadcast,
              flow_token: FLOW_TOKEN,
              recipientPhone,
            });
          } else {
            const message = getTextMessage(user.language, 'noEmployees');
            await sendTextMessage(message, recipientPhone);
          }
        } else if (reportAndApprovals === 'changeLanguage') {
          const message = getTextMessage(user.language, 'changeLanguage', []);

          const flowData = {
            screen: 'Language',
            data: {
              userData: JSON.stringify({
                companyId: user.companyId,
                action: 'employerLanguageUpdate',
              }),
              init_values: {
                userData: JSON.stringify({
                  companyId: user.companyId,
                  session: 'changeLanguage',
                }),
              },
              languagesRadio: [
                {
                  id: 'English',
                  title: 'English',
                },
                {
                  id: 'Hindi',
                  title: 'Hindi',
                },
                {
                  id: 'Spanish',
                  title: 'Spanish',
                },
                {
                  id: 'Portuguese',
                  title: 'Portuguese',
                },
                {
                  id: 'Russian',
                  title: 'Russian',
                },
                {
                  id: 'Urdu',
                  title: 'Urdu',
                },
                {
                  id: 'French',
                  title: 'French',
                },
                {
                  id: 'German',
                  title: 'German',
                },
                {
                  id: 'Bengali',
                  title: 'Bengali',
                },
                {
                  id: 'Telugu',
                  title: 'Telugu',
                },
                {
                  id: 'Marathi',
                  title: 'Marathi',
                },
                {
                  id: 'Tamil',
                  title: 'Tamil',
                },
                {
                  id: 'Kannada',
                  title: 'Kannada',
                },
                {
                  id: 'Gujarati',
                  title: 'Gujarati',
                },
                {
                  id: 'Odia',
                  title: 'Odia',
                },
                {
                  id: 'Malayalam',
                  title: 'Malayalam',
                },
                {
                  id: 'English+Hindi',
                  title: 'English And Hindi',
                },
                {
                  id: 'English+Bengali',
                  title: 'English And Bengali',
                },
                {
                  id: 'English+Spanish',
                  title: 'English And Spanish',
                },
                {
                  id: 'English+Portuguese',
                  title: 'English And Portuguese',
                },
                {
                  id: 'English+Russian',
                  title: 'English And Russian',
                },
                {
                  id: 'English+Urdu',
                  title: 'English And Urdu',
                },
                {
                  id: 'English+French',
                  title: 'English And French',
                },
                {
                  id: 'English+German',
                  title: 'English And German',
                },
                {
                  id: 'English+Telugu',
                  title: 'English And Telugu',
                },
                {
                  id: 'English+Marathi',
                  title: 'English And Marathi',
                },
                {
                  id: 'English+Tamil',
                  title: 'English And Tamil',
                },
                {
                  id: 'English+Kannada',
                  title: 'English And Kannada',
                },
                {
                  id: 'English+Gujarati',
                  title: 'English And Gujarati',
                },
                {
                  id: 'English+Odia',
                  title: 'English And Odia',
                },
                {
                  id: 'English+Malayalam',
                  title: 'English And Malayalam',
                },
              ],
            },
          };

          await sendFlow({
            body: message,
            flow_cta: 'Change Language',
            flow_data: flowData,
            flow_id: flowIds.language,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });

          session.get(recipientPhone).session = 'employerLanguageUpdate';
        } else if (reportAndApprovals === 'supportTickets') {
          const { registeredOn, timeZone, companyId, language } = user;

          const { monthStart, monthEnd } = calculateMonthRange(
            registeredOn,
            timeZone
          );

          const issues = await Issue.find(
            {
              companyId,
              $or: [{ status: 'open' }, { status: 'hold' }],
              $and: [
                { date: { $gte: monthStart } },
                { date: { $lte: monthEnd } },
              ],
            },
            { employeeId: 1, _id: 1, remark: 1, status: 1, issueType: 1 }
          );
          const employees = await Employee.find(
            { companyId, isActive: true },
            { employeeName: 1, _id: 1 }
          );

          let issuesCheckbox = [];

          if (!Array.isArray(issues) || issues.length === 0) {
            const message = getTextMessage(language, 'noIssueReq', []);
            return await sendTextMessage(message, recipientPhone);
          } else if (Array.isArray(issues) && issues.length > 0) {
            const result = {
              issuesCheckbox1: [],
              issuesCheckbox2: [],
              issuesCheckbox3: [],
              issuesCheckbox4: [],
              issuesCheckbox5: [],
            };

            const checkboxes = issues.map((issue) => {
              const employee = employees.find(
                (employee) => employee._id.toString() === issue.employeeId
              );

              return {
                id: `${issue._id.toString()}`,
                title: `${employee.employeeName.slice(0, 6)} - ${issue.issueType
                  } - ${issue.status}`.slice(0, 30),
                description: issue.remark.slice(0, 300),
              };
            });

            issuesCheckbox = generateCheckboxRequests(
              checkboxes,
              result,
              'issuesCheckbox'
            );
          }

          const message = getTextMessage(language, 'issuesApprovalFlow', []);
          const { flow, flowBody } = getFlowMessageData(message);
          const flowData = {
            screen: 'Issues_Approvals',
            data: {
              userData: 'fd',
              init_values: {
                userData: 'fd',
                approveType: 'approve',
                issues1: [...getIds(issuesCheckbox.issuesCheckbox1)],
                issues2: [...getIds(issuesCheckbox.issuesCheckbox2)],
                issues3: [...getIds(issuesCheckbox.issuesCheckbox3)],
                issues4: [...getIds(issuesCheckbox.issuesCheckbox4)],
                issues5: [...getIds(issuesCheckbox.issuesCheckbox5)],
              },
              ...issuesCheckbox,
              ...flow,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Requests',
            flow_data: flowData,
            flow_id: flowIds.issueRequests,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (reportAndApprovals === 'changeEmployeeNumber') {
          const employees = await Employee.find(
            { companyId: user.companyId },
            { _id: 1, employeeName: 1, employeeNumber: 1 }
          );

          if (Array.isArray(employees) && employees.length > 0) {
            const employeesList = employees.map((employee) => ({
              id: `${employee._id.toString()}::${employee.employeeName}::${employee.employeeNumber
                }`,
              title: employee.employeeName,
            }));

            const flowData = {
              screen: 'Select_Employee',
              data: {
                employeesList,
                flowName: 'changeNumberOfSelectedEmployee',
              },
            };

            await sendFlow({
              body: 'Select Employee',
              flow_cta: 'Select',
              flow_data: flowData,
              flow_id: flowIds.selectEmployee,
              flow_token: FLOW_TOKEN,
              recipientPhone,
              draft: false,
            });
          } else {
            await sendTextMessage('No employees found', recipientPhone);
          }
        } else if (reportAndApprovals === 'departmentreport') {
          const isReport = await createHodAttendanceReport({
            recipientPhone,
            companyId: user.companyId,
            language: user.language,
            timeZone: user.timeZone,
            department: user.departments,
            type: 'live',
          });

          if (isReport.status) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Live Report',
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (reportAndApprovals === 'manual_punching') {
          const departmentHeadIds = user.departments.filter((d) => d.head.id === user.companyId);

          let employees = await Employee.find(
            {
              'department.head.id': { $in: departmentHeadIds.map((d) => d.head.id) },
            },
            { _id: 1, employeeName: 1, employeeNumber: 1, timeZone: 1 }
          );

          employees = employees.filter(
            (employee) => employee.employeeNumber != recipientPhone
          );

          const { start, end } = getCurrentDayBounds();

          const employeeIds = employees.map((employee) =>
            employee._id.toString()
          );

          const attendances = await Attendance.find(
            {
              $and: [
                {
                  date: { $gte: start },
                },
                {
                  date: { $lte: end },
                },
              ],
              employeeId: { $in: employeeIds },
            },
            {
              _id: 0,
              companyId: 0,
            }
          );

          const attendanceMap = attendances.reduce((acc, attendance) => {
            acc[attendance.employeeId] = attendance.status;
            return acc;
          }, {});

          const result = employees.map((employee) => {
            const employeeId = employee._id.toString();

            return {
              id: `${employeeId}_@_${employee.employeeName}_@_${attendanceMap[employeeId] || ''
                }`,
              title: `${employee.employeeName.slice(0, 18)} ${attendanceMap[employeeId]
                  ? `(${attendanceMap[employeeId]})`
                  : ''
                }`,
            };
          });

          const result2 = {
            employeeList1: [],
            employeeList2: [],
            employeeList3: [],
            employeeList4: [],
          };

          const arrs = splitArray(result, Object.keys(result2).length);

          arrs.forEach((arr, i) => {
            result2[`employeeList${i + 1}`].push(...arr);
          });

          const flowData = {
            screen: 'manual_punching',
            data: {
              ...result2,
              companyId: user.companyId,
              timeZone: user.timeZone,
            },
          };

          await sendFlow({
            body: 'Manually punch employees attendance',
            flow_cta: 'Manual Punching',
            flow_data: flowData,
            flow_id: flowIds.manualPunching,
            flow_token: FLOW_TOKEN,
            recipientPhone,
            draft: false,
          });
        }
      }

      if (buseinessSettings) {
        if (buseinessSettings === 'editBusiness') {
          const dynamicData = { init_values: {} };

          const employer = await Employer.findOne(
            {
              employerNumber: Number(recipientPhone),
              _id: user.companyId,
            },
            { _id: 0 }
          );

          if (employer) {
            Object.entries(employer._doc).forEach(([key, value]) => {
              if (key === 'fullName') {
                dynamicData.init_values.employerName = value;
              } else {
                dynamicData.init_values[key] = String(value);
              }
            });
          }

          const message = getTextMessage(
            user.language,
            'business-settings',
            []
          );
          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Edit_Business',
            data: {
              init_values: dynamicData.init_values,
              ...flow,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Update',
            flow_data: flowData,
            flow_id: flowIds.editBusiness,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (buseinessSettings === 'addCoOwner') {
          let result = {
            checkbox1: [
              {
                id: 'uploadContact',
                title: 'Upload Contact',
              },
            ],
            checkbox2: [],
            checkbox3: [],
            checkbox4: [],
            checkbox5: [],
          };
          const employees = await Employee.find(
            {
              companyId: user.companyId,
              isActive: true,
            },
            { _id: 1, employeeName: 1, role: 1, employeeNumber: 1, language: 1 }
          );

          if (Array.isArray(employees) && employees.length > 0) {
            const employeesCheckBox = employees.map((employee) => ({
              id: `${employee._id.toString()}@${employee.employeeNumber}@${employee.language
                }@${employee.employeeName}`,
              title: `${employee.employeeName} (${employee.role})`,
            }));
            result = generateCheckboxRequests(
              employeesCheckBox,
              result,
              'checkbox'
            );
          } else {
            result = {
              checkbox1: [
                {
                  id: 'uploadContact',
                  title: 'Upload Contact',
                },
              ],
              checkbox2: [
                {
                  id: 'null',
                  title: '',
                },
              ],
              checkbox3: [
                {
                  id: 'null',
                  title: '',
                },
              ],
              checkbox4: [
                {
                  id: 'null',
                  title: '',
                },
              ],
              checkbox5: [
                {
                  id: 'null',
                  title: '',
                },
              ],
            };
          }

          const message = getTextMessage(user.language, 'addCoOwner', []);
          const { flow, flowBody } = getFlowMessageData(message);
          const flowData = {
            screen: 'Add_Coowner',
            data: {
              init_values: {
                userData: 't',
              },
              userData: '',
              ...result,
              ...flow,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Add',
            flow_data: flowData,
            flow_id: flowIds.addCoowners,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (buseinessSettings === 'transferOwner') {
          const employees = await Employee.find(
            {
              companyId: user.companyId,
              isActive: true,
            },
            { _id: 1, employeeName: 1, role: 1, employeeNumber: 1, language: 1 }
          );

          const result = {
            checkbox1: [
              {
                id: 'uploadContact',
                title: 'Upload Contact',
              },
            ],
            checkbox2: [],
            checkbox3: [],
            checkbox4: [],
            checkbox5: [],
          };
          const employeesCheckBox = employees?.map((employee) => ({
            id: `${employee._id.toString()}@${employee.employeeNumber}@${employee.employeeName
              }@${employee.role}@${employee.language}`,
            title: `${employee.employeeName} (${employee.role})`,
          }));
          const data = generateCheckboxRequests(
            employeesCheckBox,
            result,
            'checkbox'
          );

          const message = getTextMessage(user.language, 'transferOwner', []);
          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Transfer_Owner',
            data: {
              userData: flowMessage.userData,
              ...flow,
              ...data,
              init_values: {
                userData: flowMessage.userData,
              },
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Transfer',
            flow_data: flowData,
            flow_id: flowIds.transferOwner,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (buseinessSettings === 'deleteAccount') {
          const { message, listOfButtons } = getSimpleButtonsMessage(
            user.language,
            'accDelConfirmation',
            []
          );

          await sendSimpleButtons(
            message,
            listOfButtons(user.companyId),
            recipientPhone
          );
        } else if (buseinessSettings === 'editNotifications') {
          const message = getTextMessage(user.language, 'edit-notifs', [
            user.companyName,
          ]);
          const { flow, flowBody } = getFlowMessageData(message);
          const notifications = user.notifications;

          const flowData = {
            screen: 'Edit_Notifications',
            data: {
              init_values: {
                notifications: ['checkIn'],
                dailymorningreport:
                  notifications && notifications.morningReportTime
                    ? notifications.morningReportTime.toString()
                    : '',
                dailyeveningreport:
                  notifications && notifications.eveningReportTime
                    ? notifications.eveningReportTime.toString()
                    : '',
                monthendreport:
                  notifications && notifications.monthEndReportTime
                    ? notifications.monthEndReportTime.toString()
                    : '',
              },
              ...flow,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Update',
            flow_data: flowData,
            flow_id: flowIds.editNotifs,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        }
      }

      if (createTasks) {
        if (createTasks === 'createDailyTask') {
          const message = getTextMessage('English', 'createDailyTask');

          let employees = await Employee.find(
            { companyId: user.companyId },
            {
              _id: 1,
              employeeNumber: 1,
              employeeName: 1,
              shiftType: 1,
              checkIn: 1,
              checkOut: 1,
              natureOfTime: 1,
            }
          );
          let { branch: locations } = await Employer.findBranch(
            recipientPhone,
            user.companyId
          );

          if (!Array.isArray(employees) || employees.length === 0) {
            employees = {
              assignto1: [{ id: 'Self', title: 'Self' }],
              assignto2: [{ id: 'none', title: '' }],
              assignto3: [{ id: 'none', title: '' }],
              assignto4: [{ id: 'none', title: '' }],
            };
          } else if (employees.length > 0) {
            // eslint-disable-next-line no-inner-declarations
            function createEmployeeProperties(employees) {
              const result = {
                assignto1: [],
                assignto2: [],
                assignto3: [],
                assignto4: [],
              };

              const checkboxes = employees.map((employee) => {
                return {
                  id: `${employee.employeeNumber}@${employee._id.toString()}`,
                  title: createFormattedString(
                    employee.employeeName,
                    `${formatTime12h(employee.checkIn)
                      ?.replace(' ', '')
                      ?.toLowerCase()}-${formatTime12h(employee.checkOut)
                        ?.replace(' ', '')
                        ?.toLowerCase()}`,
                    employee.natureOfTime === 'flexible' ? 'Flexible' : 'Fixed',
                    employee.shiftType
                  ),
                };
              });

              const arrs = splitArray(checkboxes, Object.keys(result).length);

              arrs.forEach((arr, i) => {
                result[`assignto${i + 1}`].push(...arr);
              });

              return result;
            }

            employees = createEmployeeProperties(employees, recipientPhone);
          }

          if (!locations || locations.length === 0) {
            locations = [{ id: 'Any Location', title: 'Any Location' }];
          } else if (locations.length > 0) {
            locations = [
              { id: 'Any Location', title: 'Any Location' },
              ...[...locations].map((location) => ({
                id: `${location.name}_@_${location.lat}_@_${location.long}_@_${location.range}`,
                title: location.name,
              })),
            ];
          }

          const flowData = {
            screen: 'Create_Daily_Task',
            data: {
              ...message.label,
              init_values: {
                TaskName: 'Click Dustbin Pic',
                department: 'Hospitality',
                taskdescription:
                  'This is most important task , Cleaniness is Next to Godliness',
                taskinstruction:
                  'Need to first sweep, then using water clean , empty dustbin ,etc',
                timing: 'as_per_user',
                location: 'location_no',
                priority: 'as_per_user',
                'task duration': 'as_per_user',
                nooftimes: 'as_per_user',
                StartTime: 'as_per_user',
                noofprooftext: 'as_per_user',
                noofproofvideo: 'as_per_user',
                noofprooffile: 'as_per_user',
                noofproofaudio: 'as_per_user',
                noofproofphoto: 'as_per_user',
                proof: 'anyproof',
                priorityselected: 'medium',
                assignstrict1: 'assign_to_all',
                taskduration: 'as_per_user',
                proofstrict1: 'any_1_proof',
                prooftypephoto: ['photo_yes'],
                prooftypetext: ['text_yes'],
                prooftypevideo: ['video_yes'],
                prooftypefile: ['file_yes'],
                daysinweek: ['0', '1', '2', '3', '4', '5', '6'],
                prooftypeaudio: ['audio_yes'],
                // assign1: ["Self"],
                notification: ['realtime_all'],
                notify: ['realtime_all'],
              },
              companyid: user.companyId,
              ...employees,
            },
          };

          await sendFlow({
            body: 'Create Daily Task',
            flow_data: flowData,
            flow_cta: 'AutowhatTask',
            flow_id: flowIds.dailyTasks,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (createTasks === 'asAndWhenTask') {
          const message = getTextMessage('English', 'createDailyTask');

          let employees = await Employee.find({ companyId: user.companyId });
          let { branch: locations } = await Employer.findBranch(
            recipientPhone,
            user.companyId
          );

          if (!Array.isArray(employees) || employees.length === 0) {
            employees = {
              assignto1: [{ id: 'Self', title: 'Self' }],
              assignto2: [{ id: 'none', title: '' }],
              assignto3: [{ id: 'none', title: '' }],
              assignto4: [{ id: 'none', title: '' }],
            };
          } else if (employees.length > 0) {
            employees = createEmployeeProperties(employees, recipientPhone);
          }

          if (!locations || locations.length === 0) {
            locations = [{ id: 'Any Location', title: 'Any Location' }];
          } else if (locations.length > 0) {
            locations = [
              { id: 'Any Location', title: 'Any Location' },
              ...[...locations].map((location) => ({
                id: `${location.name}_@_${location.lat}_@_${location.long}_@_${location.range}`,
                title: location.name,
              })),
            ];
          }

          const date = new Date();

          const flowData = {
            screen: 'As_And_When_Task',
            data: {
              taskNameLabel: 'Task Name',
              taskDescriptionLabel: 'Task Description',
              taskPriorityLabel: 'Task Priority',
              assignToBranchLabel: 'Assign To Branch',
              minDate: new Date().getTime(),
              maxDate: new Date(
                date.getFullYear(),
                date.getMonth() + 6,
                0
              ).getTime(),
              ...message.label,
              taskPriorityOptions: [
                {
                  id: 'low',
                  title: 'Low',
                },
                {
                  id: 'High',
                  title: 'High',
                },
                {
                  id: 'urgent',
                  title: 'Urgent',
                },
                {
                  id: 'critical',
                  title: 'Critical',
                },
              ],
              assignToBranchOptions: locations,
              assignToPersonOptions: employees,
            },
          };

          await sendFlow({
            body: 'Create As And When Task',
            flow_data: flowData,
            flow_cta: 'AutowhatTask',
            flow_id: flowIds.asAndWhenTask,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        }
      }

      if (editTimingsByBranch) {
        const message = getTextMessage(user.language, 'edit-timings', []);
        const { flow, flowBody } = getFlowMessageData(message);

        const flowData = {
          screen: 'Edit_Timings_By_Branch',
          data: {
            title: 'Edit Shifts',
            branchesLabel: 'Branches',
            branchName: editTimingsByBranch,
            ...flow,
          },
        };
        await sendFlow({
          body: flowBody,
          flow_cta: 'Edit Timings',
          flow_data: flowData,
          flow_id: flowIds.editShiftTimingsBranchWise,
          flow_token: FLOW_TOKEN,
          recipientPhone,
        });
      }

      if (departmentReports) {
        if (departmentReports === 'liveReport') {
          const isReport = await createHodAttendanceReport({
            recipientPhone,
            companyId: user.companyId,
            language: user.language,
            timeZone: user.timeZone,
            department: user.departments,
            type: 'live',
          });

          if (isReport.status) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Live Report',
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (departmentReports === 'yesterdayReport') {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          const isReport = await createHodAttendanceReport({
            recipientPhone,
            companyId: user.companyId,
            language: user.language,
            timeZone: user.timeZone,
            department: user.departments,
            startDate: yesterday,
            endDate: yesterday,
            type: 'yesterday',
          });

          if (isReport.status) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Yesterday Report',
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (departmentReports === 'currentMonthReport') {
          const currentMonthStart = new Date();
          currentMonthStart.setDate(1);

          const currentMonthEnd = new Date();

          const isReport = await createHodAttendanceReport({
            recipientPhone,
            companyId: user.companyId,
            language: user.language,
            timeZone: user.timeZone,
            department: user.departments,
            startDate: currentMonthStart,
            endDate: currentMonthEnd,
            type: 'monthly',
          });

          if (isReport.status) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Current Month Report',
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (departmentReports === 'dateRangeReport') {
        }
      }
    } else if (flowName === 'employeeManagement') {
      const {
        reports,
        leaveRequests,
        support,
        onDutyCorrection,
        extraReports,
        inOutCorrection,
        userData,
      } = flowMessage;

      const { language, timeZone, companyId, createdAt } = user;

      if (reports) {
        if (reports === 'current' || reports === 'previous') {
          const isReport = await createEmployeeReport(reports, {
            companyId: user.companyId,
            timeZone: user.timeZone,
            companyName: user.companyName,
            companyNumber: user.employerNumber,
            employeeId: user.employeeId,
            language: user.language,
          });

          if (isReport) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${user.employeeId}-employeeReport.pdf`
              ),
              caption: `${capitalize(reports)} Month Report`,
            });
          }
        } else if (reports === 'customDateRange') {
          await sendDateRangeFlow(
            user.language,
            user.createdAt,
            'dateRangeReport',
            recipientPhone
          );
        } else if (reports === 'raiseIssue') {
          // const data = JSON.stringify({
          //   employeeId,
          //   companyId,
          //   timeZone,
          //   language,
          // });

          const message = getTextMessage(language, 'raiseIssue', []);

          const { flow, flowBody } = getFlowMessageData(message);

          const flowData = {
            screen: 'Create_Issue',
            data: {
              ...flow,
              init_values: {
                userData,
              },
              userData,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_cta: 'Raise Issue',
            flow_data: flowData,
            flow_id: flowIds.createIssues,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else if (reports === 'manual_punching') {
          const departmentHeadIds = user.department.map((d) => d.head.id);

          let employees = await Employee.find(
            {
              'department.head.id': { $in: departmentHeadIds },
            },
            { _id: 1, employeeName: 1, employeeNumber: 1, timeZone: 1 }
          );

          employees = employees.filter(
            (employee) => employee.employeeNumber != recipientPhone
          );

          const { start, end } = getCurrentDayBounds();

          const employeeIds = employees.map((employee) =>
            employee._id.toString()
          );

          const attendances = await Attendance.find(
            {
              $and: [
                {
                  date: { $gte: start },
                },
                {
                  date: { $lte: end },
                },
              ],
              employeeId: { $in: employeeIds },
            },
            {
              _id: 0,
              companyId: 0,
            }
          );

          const attendanceMap = attendances.reduce((acc, attendance) => {
            acc[attendance.employeeId] = attendance.status;
            return acc;
          }, {});

          const result = employees.map((employee) => {
            const employeeId = employee._id.toString();

            return {
              id: `${employeeId}_@_${employee.employeeName}_@_${attendanceMap[employeeId] || ''
                }`,
              title: `${employee.employeeName.slice(0, 18)} ${attendanceMap[employeeId]
                  ? `(${attendanceMap[employeeId]})`
                  : ''
                }`,
            };
          });

          const result2 = {
            employeeList1: [],
            employeeList2: [],
            employeeList3: [],
            employeeList4: [],
          };

          const arrs = splitArray(result, Object.keys(result2).length);

          arrs.forEach((arr, i) => {
            result2[`employeeList${i + 1}`].push(...arr);
          });

          const flowData = {
            screen: 'manual_punching',
            data: {
              ...result2,
              companyId,
              timeZone,
            },
          };

          await sendFlow({
            body: 'Manually punch employees attendance',
            flow_cta: 'Manual Punching',
            flow_data: flowData,
            flow_id: flowIds.manualPunching,
            flow_token: FLOW_TOKEN,
            recipientPhone,
            draft: false,
          });
        }
      }

      if (leaveRequests) {
        if (leaveRequests === 'oneDay') {
          const message = getTextMessage(language, leaveRequests, []);
          const { flow, flowBody } = getFlowMessageData(message);

          const currentDate = new Date();
          const flowData = {
            screen: 'Request_Leave_One',
            data: {
              minDate: currentDate.getTime().toString(),
              maxDate: getSixMonthsInMs(currentDate).toString(),
              userData,
              init_values: {
                userData,
              },
              ...flow,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_id: flowIds.oneDay,
            flow_token: FLOW_TOKEN,
            flow_cta: 'Select Date',
            flow_data: flowData,
            recipientPhone,
          });
        } else if (leaveRequests === 'manyDay') {
          const message = getTextMessage(language, leaveRequests, []);
          const { flow, flowBody } = getFlowMessageData(message);

          const currentDate = new Date();

          const flowData = {
            screen: 'Request_Leave_Many',
            data: {
              userData,
              init_values: {
                userData,
              },
              minDate: currentDate.getTime().toString(),
              maxDate: getSixMonthsInMs(currentDate).toString(),
              ...flow,
            },
          };

          await sendFlow({
            body: flowBody,
            flow_id: flowIds.manyDay,
            flow_token: FLOW_TOKEN,
            flow_cta: 'Pick a Date',
            flow_data: flowData,
            recipientPhone,
          });
        }
      }

      if (support) {
        if (
          support === 'check-in' ||
          support === 'check-out' ||
          support === 'salary-issue' ||
          support === 'other-issue'
        ) {
          session.get(recipientPhone).session = 'support-issue';
          const message = getTextMessage(language, 'employeeIssue', []);
          await sendTextMessage(message, recipientPhone);
        }
      }

      if (onDutyCorrection || inOutCorrection) {
        let date = '';
        const correctionData = user;

        // correctionData.employeeName = user.employeeName;

        if (inOutCorrection) {
          date = moment.tz(inOutCorrection.split('@')[1], timeZone);
          const docId = inOutCorrection.split('@')[0];

          correctionData.documentId = docId;
          correctionData.date = date;
        } else {
          date = moment.tz(onDutyCorrection, timeZone);
          correctionData.documentId = 'undefined';
          correctionData.date = date;
        }

        const message = getTextMessage(
          language,
          'attendanceCorrectionFlow',
          []
        );

        const { flow, flowBody } = getFlowMessageData(message);

        const flowData = {
          screen: 'Attendance_Correction',
          data: {
            init_values: {
              userData: JSON.stringify(correctionData),
            },
            ...flow,
            attendanceDate: `Date - ${date.format('DD/MM/YY')}`,
            userData: JSON.stringify(correctionData),
          },
        };

        await sendFlow({
          // body: message.body,
          body: flowBody,
          flow_id: flowIds.attCorrection,
          flow_token: FLOW_TOKEN,
          flow_cta: 'Correct',
          flow_data: flowData,
          recipientPhone,
        });
      }

      if (extraReports) {
        if (extraReports === 'liveReport') {
          let isReport = {};

          if (user.role === 'hod') {
            isReport = await createHodAttendanceReport({
              recipientPhone,
              companyId: user.companyId,
              language: user.language,
              timeZone: user.timeZone,
              department: user.department,
              type: 'live',
            });
          } else if (user.role === 'coowner') {
            isReport = await createAttendanceReport({
              type: 'live',
              recipientPhone,
              companyId: user.companyId,
              language: user.language,
              timeZone: user.timeZone,
            });
          }

          if (isReport.status) {
            await sendDocument({
              recipientPhone,
              file_path: path.join(
                process.env.ROOT_PATH,
                `${recipientPhone}_attendance_report.pdf`
              ),
              caption: 'Live Report',
            });

            await deleteFile(`${recipientPhone}_attendance_report.pdf`);
          } else {
            await sendTextMessage(isReport.message, recipientPhone);
          }
        } else if (extraReports === 'yesterdayreport') {
          await sendTextMessage('Feature not yet implemented');
          // const isReport = await createLiveReport(

          //   recipientPhone,
          //   { companyId, language, timeZone },
          //   'yesterday'
          // );
          // if (isReport.status) {
          //   await sendDocument({
          //     recipientPhone,
          //     file_path: path.join(
          //       process.env.ROOT_PATH,
          //       `${recipientPhone}-yesterdayReport.pdf`
          //     ),
          //     caption: 'Yesterday Report',
          //   });
          //   await deleteFile(`${recipientPhone}-yesterdayReport.pdf`);
          // } else {
          //   await sendTextMessage(isReport.message, recipientPhone);
          // }
        } else if (extraReports === 'customdaterangepdf') {
          let minDate = createdAt;

          if (companyId === process.env.HONDA_COMPANY_ID) {
            minDate = getMinDateForDateRange(createdAt);
          }

          await sendDateRangeFlow(
            language,
            minDate,
            'dateRangeReport',
            recipientPhone
          );
        }
      }
    } else if (flowName === 'attendanceShiftSelection') {
      const {
        employee
      } = flowMessage;

      let { message, listOfButtons } = getSimpleButtonsMessage(user.language, "MarkAttendance");

      listOfButtons = listOfButtons.filter((button) => button.id === 'in');

      session.get(recipientPhone).shiftEmployee = employee;

      await sendSimpleButtons(message, listOfButtons, recipientPhone);
    } else if (flowName === 'manual_punching') {
      const { employees1, employees2, employees3, employees4 } = flowMessage;

      let employees = Array.isArray(employees1) ? [...employees1] : [];
      employees.push(
        ...(employees2 || []),
        ...(employees3 || []),
        ...(employees4 || [])
      );

      const owners = await Employer.find(
        {
          $or: [{ _id: user.companyId }, { companyId: user.companyId }],
        },
        { employerNumber: 1 }
      );

      employees = employees.slice(0, 8);

      const payload = {};

      for (let i = 0; i < 8; i++) {
        const emp = employees[i];
        let j = i + 1;

        if (emp) {
          const [id, name] = emp.split('_@_');

          payload[`employee${j}Id`] = `${id}_@_${name}`;
          payload[`employee${j}Name`] = name;
        } else {
          payload[`employee${j}Id`] = 'null';
          payload[`employee${j}Name`] = '';
        }
      }

      const flowData = {
        screen: 'Screen_One',
        data: {
          ...payload,
          companyId: user.companyId,
          timeZone: user.timeZone,
          ownerNumbers: owners
            ?.map((owner) => owner.employerNumber)
            ?.join('_@_'),
          checkInResponseText: '',
          statusRadio: [
            {
              "id": "full-day",
              "title": "Full Day"
            },
            {
              "id": "half-day",
              "title": "Half day"
            },
            {
              "id": "late",
              "title": "Late"
            }
          ]
        },
      };

      if (process.env.HONDA_COMPANY_ID !== user.companyId) {
        flowData.data.statusRadio.push({ id: "onTime", title: "On Time" })
      }

      await sendFlow({
        body: 'select timing and upload photos of selected employees',
        flow_cta: 'Select',
        flow_data: flowData,
        flow_id: 1603405353912243,
        flow_token: FLOW_TOKEN,
        recipientPhone,
        draft: false,
      });
    } else if (flowName === 'changeNumberOfSelectedEmployee') {
      const { employee } = flowMessage;

      const [employeeId, employeeName, employeeNumber] =
        employee?.split('::') ?? [];

      if (employeeId && employeeName && employeeNumber) {
        const flowData = {
          screen: 'Change_Employee_Number',
          data: {
            employeeId,
            oldEmployeeName: employeeName,
            oldEmployeeNumber: employeeNumber,
          },
        };

        await sendFlow({
          body: 'Change Number',
          flow_cta: 'Change',
          flow_data: flowData,
          flow_id: flowIds.changeEmployeeNumber,
          flow_token: FLOW_TOKEN,
          recipientPhone,
          draft: false,
        });
      }
    } else if (flowName === 'changeEmployeeNumber') {
      const { employeeName, employeeNumber, employeeId } = flowMessage;

      const updateRes = await Employee.updateOne(
        { _id: employeeId },
        { $set: { employeeName, employeeNumber } }
      );

      if (updateRes.acknowledged) {
        return await sendTextMessage(
          'Number changed successfully',
          recipientPhone
        );
      }

      await sendTextMessage('failed to change number', recipientPhone);
    } else if (flowName === 'leaveOneDay' || flowName === 'manyDayLeave') {
      // const recipient = parseUserData(flowMessage.userData, user);

      const startDate = new Date(flowMessage.startDate);
      const endDate = new Date(flowMessage.endDate);
      const ticketNumber = Math.floor(Math.random() * 90000) + 10000;

      const from = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
      );

      let leaveType = 'one day';

      const leave = {
        employeeId: user.employeeId,
        companyId: user.companyId,
        leaveType,
        from,
        ticketNo: ticketNumber,
        reason: flowMessage.reasonForLeave?.trim(),
      };

      if (flowName === 'manyDayLeave') {
        leaveType = 'many day';
        leave.to = new Date(
          endDate.getFullYear(),
          endDate.getMonth(),
          endDate.getDate()
        );
        leave.leaveType = leaveType;
      }

      const leaveDoc = await Leave.create(leave);

      if (leaveDoc) {
        const message = getTextMessage(user.language, 'leaveSummary', [
          user.employeeName,
          '-',
          leaveType,
          from.toDateString(),
          leave.to?.toDateString(),
          flowMessage.reasonForLeave?.trim(),
          ticketNumber,
          recipientPhone,
        ]);

        await sendTextMessage(message, recipientPhone);

        const { notifications } = await Employer.findNotfications(
          user.companyId
        );

        if (!notifications.leaveRequest) return;

        let employerLanguage = session.get(user.employerNumber)?.user?.language;

        if (!employerLanguage) {
          const employer = await Employer.findById(user.companyId, {
            language: 1,
          });
          employerLanguage = employer.language;
        }

        const { message: approveMessage, listOfButtons } =
          getSimpleButtonsMessage(employerLanguage, 'sendLeave', [
            user.employeeName,
            leaveType,
            from.toDateString(),
            leave.to?.toDateString(),
            flowMessage.reasonForLeave?.trim(),
          ]);

        await sendSimpleButtons(
          approveMessage,
          listOfButtons(
            `${leaveDoc._id.toString()}_${recipientPhone}_${user.language}`
          ),
          user.employerNumber
        );
      } else {
        const message = getTextMessage(
          user.language,
          'createLeaveFailed',
          [],
          'main'
        );
        await sendTextMessage(message, recipientPhone);
      }

      // if (startDate && user) {
      // if (session.get(recipientPhone).session === "employeeDemo") {
      //   const message = getTextMessage(
      //     language,
      //     "leaveSummary",
      //     [
      //       employeeName,
      //       department,
      //       leaveType,
      //       new Date(startDate).toDateString(),
      //       new Date(endDate)?.toDateString(),
      //       flowMessage.reasonForLeave,
      //       ticketNumber,
      //       recipientPhone,
      //     ],
      //
      //   );
      //   await sendTextMessage(message, recipientPhone);
      //   await delay(3000);
      //   const { message: supportMessage, listOfButtons } = getSimpleButtonsMessage(
      //     language,
      //     "startSupport"
      //   );
      //   await sendSimpleButtons(supportMessage, listOfButtons, recipientPhone);
      //   return;
      // }
      // }
    } else if (flowName === 'editEmployee') {
      const {
        joiningDate,
        dateOfBirth,
        natureOfTime,
        branch,
        shiftType,
        workDays,
        proof,
        role,
        department,
      } = flowMessage;

      const branches = branch.map((branc) => {
        const [branch, lat, long, range] = branc.split('_@_');
        return {
          name: branch.trim(),
          lat: lat,
          long: long,
          range: range,
        };
      });

      const checkIn = timeStringToEpochDate(flowMessage.checkIn);
      const checkOut = timeStringToEpochDate(flowMessage.checkOut);

      let employeeNumber =
        flowMessage.employeeNumber || flowMessage.defaultEmpNo;
      const employeeName =
        flowMessage.employeeName || flowMessage.defaultEmpName;

      const workingHours = calculateWorkingHours(
        flowMessage.checkIn,
        flowMessage.checkOut
      );

      const companyDetails = await Employer.findOne({
        employerNumber: recipientPhone,
      });

      if (employeeNumber.length === 10) {
        employeeNumber = `91${employeeNumber}`;
      }

      const employee = await Employee.findOne({
        employeeNumber,
        companyId: user.companyId,
        isActive: true,
      });

      const proofs = Object.entries(employee?.proof ?? {});
      const updatedProof = {};

      Array.isArray(proofs) &&
        proofs?.forEach(([prf]) => {
          if (proof.includes(prf)) {
            updatedProof[prf] = true;
          } else {
            updatedProof[prf] = false;
          }
        });

      const dept = companyDetails?.departments?.find(
        (d) => d.id === department
      );

      const data = {
        employeeName,
        employeeNumber,
        companyId: companyDetails._id?.toString(),
        companyName: companyDetails.companyName,
        employerNumber: recipientPhone,
        checkIn,
        checkOut,
        locations: branches,
        joiningDate,
        dateOfBirth,
        workingHours,
        natureOfTime,
        workDays: workDays.map(Number),
        shiftType,
        proof: updatedProof ?? {
          logs: true,
          location: true,
          image: true,
        },
        department: [...(employee?.department ?? []), ...(dept ? [dept] : [])],
        role,
      };

      if (employee) {
        const res = await Employee.updateOne({
          employeeNumber: Number(data.employeeNumber),
          companyId: user.companyId,
        }, { $set: data });

        const message = getTextMessage(
          user.language,
          'contactsUpdate',
          [],
          'main'
        );
        await sendTextMessage(message, recipientPhone);
        return;
      } else {
        const res = await Employee.create(data);

        if (res) {
          await sendEmployeeDemoTemplate(
            `${companyDetails.companyName}`,
            employeeNumber.split(' ').join('')
          );
        } else {
          return await sendTextMessage(
            'Failed to add employee',
            recipientPhone
          );
        }
      }

      const { language } = session.get(recipientPhone).user;
      const message = getTextMessage(language, 'employeeUploaded', []);

      await sendImage({
        url: 'https://i.ibb.co/S6XxtXy/Hi-2.png',
        caption: message,
        recipientPhone,
      });
    } else if (flowName === 'addBranch') {
      const { user } = session.get(recipientPhone);
      const { employees, branchname, coords } = flowMessage;
      const [lat, long] = coords.split(',');

      let range = flowMessage.range;

      if (range < 200) range = 200;

      await Promise.allSettled(
        employees?.map(async (employee) => {
          await Employee.updateOne(
            { employeeNumber: Number(employee), companyId: user.companyId },
            { $pull: { locations: {} } }
          );

          await Employee.updateLocations(Number(employee), user.companyId, {
            range,
            name: branchname.trim(),
            lat: Number(lat),
            long: Number(long),
          });
        })
      );

      await Employer.updateBranch(recipientPhone, user.companyId, {
        lat: Number(lat),
        long: Number(long),
        name: branchname,
        range,
      });

      const message = getTextMessage(user.language, 'placeCreated', []);

      await sendTextMessage(message, recipientPhone);

      session.delete(recipientPhone);
    } else if (flowName === 'editBusiness') {
      const { user } = session.get(recipientPhone);

      await Employer.updateOne(
        {
          employerNumber: recipientPhone,
        },
        { ...flowMessage }
      );

      const message = getTextMessage(user.language, 'businessUpdated', []);
      await sendTextMessage(message, recipientPhone);
    } else if (flowName === 'editTimings') {
      const {
        employees1,
        employees2,
        employees3,
        employees4,
        natureOfTime,
        workingHours,
        shiftType,
        workDays,
      } = flowMessage;

      const checkIn = new Date(
        1970,
        0,
        1,
        Number(flowMessage.checkIn.split(':')[0]),
        Number(flowMessage.checkIn.split(':')[1])
      );
      const checkOut = new Date(
        1970,
        0,
        1,
        Number(flowMessage.checkOut.split(':')[0]),
        Number(flowMessage.checkOut.split(':')[1])
      );

      const employees = Array.isArray(employees1) ? [...employees1] : [];

      employees.push(
        ...(employees2 || []),
        ...(employees3 || []),
        ...(employees4 || [])
      );

      const { user } = session.get(recipientPhone);

      try {
        await Promise.all(
          employees.map(async (employee) => {
            if (!isNaN(Number(employee))) {
              await Employee.updateOne(
                { employeeNumber: employee, companyId: user.companyId },
                {
                  natureOfTime,
                  checkIn,
                  checkOut,
                  workingHours,
                  shiftType,
                  workDays: [...workDays.map(Number)],
                }
              );
            }
          })
        );

        const message = getTextMessage(user.language, 'shiftUpdated', []);
        await sendTextMessage(message, recipientPhone);
      } catch (error) {
        console.error('Error updating employee details:', error);
      }
    } else if (flowName === 'editGeoFencing') {
      const { user } = session.get(recipientPhone);
      const {
        employees1,
        employees2,
        employees3,
        employee4,
        places,
        natureOfTime,
      } = flowMessage;

      const placeDetails = Array.isArray(places) ? [...places] : [];

      const branches = placeDetails.map((place) => {
        const [branch, lat = '', long = '', range = ''] = String(place).split(
          '_@_'
        );
        const branchName = branch?.trim();

        const existingBranch =
          user.places?.find((item) => item.name === branchName) ?? {};

        const branchData = {
          name: branchName,
        };

        const latValue = lat !== '' ? Number(lat) : existingBranch.lat;
        const longValue = long !== '' ? Number(long) : existingBranch.long;
        const rangeValue = range !== '' ? Number(range) : existingBranch.range;

        if (!Number.isNaN(latValue) && latValue !== undefined) {
          branchData.lat = latValue;
        }

        if (!Number.isNaN(longValue) && longValue !== undefined) {
          branchData.long = longValue;
        }

        if (!Number.isNaN(rangeValue) && rangeValue !== undefined) {
          branchData.range = rangeValue;
        }

        if (existingBranch.id) {
          branchData.id = existingBranch.id;
        }

        return branchData;
      });

      const employees = Array.isArray(employees1) ? [...employees1] : [];
      employees.push(
        ...(employees2 || []),
        ...(employees3 || []),
        ...(employee4 || [])
      );

      const employeeNumbers = employees
        .map((employee) => Number(employee))
        .filter((employeeNumber) => !Number.isNaN(employeeNumber));

      const placeNames = branches.map((branch) => branch.name).filter(Boolean);

      if (employeeNumbers.length > 0) {
        await Employee.updateMany({ companyId: user.companyId }, { $pull: { locations: { name: { $in: placeNames } } } });
        await Employee.updateMany(
          { companyId: user.companyId, employeeNumber: { $in: employeeNumbers.map(Number) } },
          {
            $push: { locations: branches },
            ...(natureOfTime ? { natureOfTime } : {})
          }
        );
      } else if (placeNames.length > 0) {
        await Employee.updateMany(
          { companyId: user.companyId },
          {
            $pull: {
              locations: { name: { $in: placeNames } },
            },
          }
        );
      }

      const message = getTextMessage(
        user.language,
        'employeeGeoFencing',
        [],
        'main'
      );
      await sendTextMessage(message, recipientPhone);
    } else if (flowName === 'editNotification') {
      const { user } = session.get(recipientPhone);
      const {
        notifications,
        morningReportTime,
        monthEndReportTime,
        eveningReportTime,
      } = flowMessage;

      const updateObject = {};

      for (const notification of notifications) {
        updateObject[notification] = true;
      }

      await Employer.updateNotifications(recipientPhone, user.companyId, {
        ...updateObject,
        morningReportTime: Number(morningReportTime),
        monthEndReportTime: Number(monthEndReportTime),
        eveningReportTime: Number(eveningReportTime),
      });

      session.get(recipientPhone).user.notifications = {
        ...updateObject,
        morningReportTime,
        monthEndReportTime,
        eveningReportTime,
      };
    } else if (flowName === 'removeEmployees') {
      const { employees1, employees2, employees3, employee4 } = flowMessage;

      const employees = [
        ...employees1,
        ...(employees2 || []),
        ...(employees3 || []),
        ...(employee4 || []),
      ];

      if (employees && employees.length > 0) {
        await Promise.allSettled(
          employees.map((employee) => {
            if (!isNaN(employee)) {
              Employee.updateEmployeeStatus(employee, user.companyId);
            }
          })
        );

        const message = getTextMessage(user.language, 'employeeRemove', []);

        await sendTextMessage(message, recipientPhone);
      }
    } else if (flowName === 'removeBranch') {
      const { branch, employees1, employees2, employees3, employee4 } =
        flowMessage;

      const employees = [
        ...employees1,
        ...(employees2 || []),
        ...(employees3 || []),
        ...(employee4 || []),
      ].filter((employee) => employee !== 'null');

      if (
        (Array.isArray(branch) && branch.length > 0) ||
        (Array.isArray(employees) && employees.length > 0)
      ) {
        await Promise.allSettled(
          employees.map((employee) => {
            Employee.removeBranchFromEmployees(
              branch,
              employee,
              recipientPhone,
              user.companyId
            );
          })
        );
        const message = getTextMessage(
          user.language,
          'employeeRemovePlace',
          []
        );
        await sendTextMessage(message, recipientPhone);
        session.delete(recipientPhone);
      }
    } else if (flowName === 'addGeoLocation') {
      const { branchname, coords } = flowMessage;
      const [lat, long] = coords.split(',');

      let range = flowMessage.range;

      if (range < 200) range = 200;

      await Employer.updateBranch(recipientPhone, user.companyId, {
        lat: Number(lat),
        long: Number(long),
        name: branchname,
        range,
      });

      if (sessionType === 'addPlace') {
        const message = getTextMessage(user.language, 'placeCreated', []);
        await sendTextMessage(message, recipientPhone);
        session.delete(recipientPhone);
      } else {
        const message = getTextMessage(user.language, 'uploadEmployee', []);

        await sendImage({
          caption: message,
          url: 'https://i.ibb.co/Njkhcnb/5dc415a6-1caf-45d9-8f65-f41188215194.jpg',
          recipientPhone,
        });
      }
    } else if (flowName === 'dateRangeReport') {
      const { startDate, endDate } = flowMessage;

      const start = moment.tz(new Date(startDate), user.timeZone);
      const end = moment.tz(new Date(endDate), user.timeZone);

      user.companyNumber = recipientPhone;

      // const isReport = await createDateRangeReport(start, end, user);
      const isReport = await createAttendanceReport({
        type: 'date_range',
        recipientPhone,
        companyId: user.companyId,
        language: user.language,
        timeZone: user.timeZone,
        startDate: start,
        endDate: end,
      });

      if (isReport.status) {
        const rootPath = process.env.ROOT_PATH;
        const fileName = `${recipientPhone}_attendance_report.pdf`;
        const filePath = path.join(rootPath, fileName);

        await delay(1500);
        const isFile = await fileExists(filePath);

        if (isFile) {
          await sendDocument({
            caption: 'Date Range Report',
            file_path: filePath,
            recipientPhone,
          });
          await deleteFile(fileName);
        }
      } else {
        await sendTextMessage(isReport.status, recipientPhone);
      }
    } else if (flowName === 'ShortSummaryReport') {
      const { startDate, endDate } = flowMessage;

      const start = moment.tz(new Date(startDate), user.timeZone);
      const end = moment.tz(new Date(endDate), user.timeZone);

      user.companyNumber = recipientPhone;

      // const isReport = await createDateRangeReport(start, end, user);
      const isReport = await createAttendanceReport({
        type: 'monthly_summary',
        recipientPhone,
        companyId: user.companyId,
        language: user.language,
        timeZone: user.timeZone,
        startDate: start,
        endDate: end,
      });

      if (isReport.status) {
        const rootPath = process.env.ROOT_PATH;
        const fileName = `${recipientPhone}_attendance_report.pdf`;
        const filePath = path.join(rootPath, fileName);

        await delay(1500);
        const isFile = await fileExists(filePath);

        if (isFile) {
          await sendDocument({
            caption: 'Date Range Report',
            file_path: filePath,
            recipientPhone,
          });
          await deleteFile(fileName);
        }
      } else {
        await sendTextMessage(isReport.status, recipientPhone);
      }
    } else if (flowName === 'broadcast') {
      const { file, employees, boradcastMessage } = flowMessage;

      if (file && file !== 'text') {
        session.get(recipientPhone).session = 'broadcast';
        session.get(recipientPhone).employees = employees;
        session.get(recipientPhone).broadcastMessage = boradcastMessage;

        const message = getTextMessage(user.language, 'uploadFile', [file]);
        await sendTextMessage(message, recipientPhone);
      } else {
        await Promise.allSettled(
          employees.map((employee) => {
            return sendTextMessage(boradcastMessage, employee);
          })
        );
        const message = getTextMessage(user.language, 'broadcasted', []);
        await sendTextMessage(message, recipientPhone);
      }
    } else if (flowName === 'forgetInOut') {
      const { checkin, checkout, remark } = flowMessage;

      const userData = JSON.stringify(flowMessage.userData);

      const {
        employeeId,
        timeZone,
        companyId,
        date,
        employerNumber,
        language,
        employeeName,
      } = user;

      const momentDate = moment.tz(new Date(date), timeZone);
      const checkInTime = dateFromHourStr(momentDate, checkin, timeZone);
      const checkOutTime = dateFromHourStr(momentDate, checkout, timeZone);

      const documentId = await updateAttendance({
        employeeId,
        companyId,
        checkOutTime,
        checkInTime,
        documentId: userData.documentId,
        date: momentDate,
        creationType: {
          type: 'correction',
          status: 'pending',
        },
      });

      if (documentId) {
        // const id = JSON.stringify({
        //   documentId,
        // });

        const formattedCheckInTime = formatTime12h(checkInTime, timeZone);
        const formattedCheckOutTime = formatTime12h(checkOutTime, timeZone);

        let employerLanguage = session.get(employerNumber)?.user?.language;

        if (!employerLanguage) {
          const employer = await Employer.findById(companyId, { language: 1 });
          employerLanguage = employer.language;
        }

        const { message, listOfButtons } = getSimpleButtonsMessage(
          employerLanguage,
          'reqAttCorr',
          [
            employeeName,
            momentDate.format('DD/MM/YY'),
            formattedCheckInTime,
            formattedCheckOutTime,
            remark,
          ]
        );
        await sendSimpleButtons(
          message,
          listOfButtons(
            `${documentId}@${recipientPhone}@${language}@${timeZone}`
          ),
          employerNumber
        );

        const approvalMessage = getTextMessage(language, 'attWaitAppr', []);
        await sendTextMessage(approvalMessage, recipientPhone);
      }
    } else if (flowName === 'attendanceApprovals') {
      const {
        corrections1,
        corrections2,
        corrections3,
        corrections4,
        corrections5,
        approveType,
      } = flowMessage;

      const corrections = [
        corrections1,
        corrections2,
        corrections3,
        corrections4,
        corrections5,
      ]
        .flat()
        .filter((corr) => corr.length > 0 && corr !== 'null');

      if (corrections.length > 0) {
        const promises = await Promise.allSettled(
          corrections.map((correction) => {
            return Attendance.updateOne(
              { _id: correction },
              { 'creationType.status': approveType }
            );
          })
        );

        const allFullfilled = promises.every(
          (promise) => promise.status === 'fulfilled'
        );

        if (allFullfilled) {
          const message = getTextMessage(
            user.language,
            'requestApprove',
            [approveType],
            'main'
          );
          await sendTextMessage(message, recipientPhone);
        } else {
          const message = getTextMessage(
            user.language,
            'failedToUpdate',
            [],
            'main'
          );
          await sendTextMessage(message, recipientPhone);
        }
      }
    } else if (flowName === 'leaveApprovals') {
      const {
        requests1,
        requests2,
        requests3,
        requests4,
        requests5,
        approveType,
      } = flowMessage;

      const requests = [requests1, requests2, requests3, requests4, requests5]
        .flat()
        .filter((req) => req.length > 0 && req !== 'null');

      if (requests.length > 0) {
        const promises = await Promise.allSettled(
          requests.map((request) => {
            return Leave.updateOne(
              { _id: request },
              { status: approveType, updatedAt: new Date() }
            );
          })
        );

        const allFullfilled = promises.every(
          (request) => request.status === 'fulfilled'
        );

        if (allFullfilled) {
          const message = getTextMessage(
            user.language,
            'requestApprove',
            [approveType],
            'main'
          );
          await sendTextMessage(message, recipientPhone);
        } else {
          const message = getTextMessage(
            user.language,
            'failedToUpdate',
            [],
            'main'
          );
          await sendTextMessage(message, recipientPhone);
        }
      }
    } else if (flowName === 'vitals') {
      const { temperature, spo2, pulseRate, bp } = flowMessage;

      const checkIn = await isCheckIn(user);

      if (checkIn.attendance) {
        const res = await checkIn.attendance.updateOne({
          $push: {
            logs: {
              time: moment.tz(new Date(), user.timeZone),
              logType: 'vitals',
              log: `${bp}, ${temperature}, ${spo2}, ${pulseRate}`,
            },
          },
        });

        if (res.acknowledged) {
          await sendTextMessage('vitals has been updated', recipientPhone);
        } else {
          await sendTextMessage('vitals has been updated', recipientPhone);
        }
      } else {
        await sendTextMessage(
          'Please checkIn to update vitals',
          recipientPhone
        );
      }
    } else if (flowName === 'addCoowner') {
      const { employees1, employees2, employees3, employees4, employees5 } =
        flowMessage;

      const employees = [
        employees1,
        employees2,
        employees3,
        employees4,
        employees5,
      ]
        .flat()
        .filter((employeeId) => employeeId !== 'null');

      if (Array.isArray(employees)) {
        if (employees.includes('uploadContact')) {
          const message = getTextMessage(
            user.language,
            'uploadCoownerContact',
            [],
            'main'
          );
          await sendTextMessage(message, recipientPhone);

          session.get(recipientPhone).session = 'addCoowner';
        } else {
          const promises = await Promise.allSettled(
            employees.map(async (employee) => {
              const addCoownerLogs = new CoownerLogs({
                status: 'pending',
                companyId: user.companyId,
                from: {
                  time: moment.tz(new Date(), user.timeZone),
                },
                to: {
                  time: moment.tz(new Date(), user.timeZone),
                },
              });

              const [employeeId, employeeNumber, language, employeeName] =
                employee.split('@');

              const { message, listOfButtons } = getSimpleButtonsMessage(
                language,
                'coownerRequest',
                [employeeName, user.employerName, user.companyName],
                'main'
              );

              await addCoownerLogs.save();

              const data = `${employeeId}@${recipientPhone}@${employeeName}@${addCoownerLogs._id.toString()}`;
              return sendSimpleButtons(
                message,
                listOfButtons(data),
                employeeNumber
              );
            })
          );

          const allFulfilled = promises.every(
            (promise) => promise.status === 'fulfilled'
          );

          if (allFulfilled) {
            const message = getTextMessage(
              user.language,
              'notifSent',
              [],
              'main'
            );
            await sendTextMessage(message, recipientPhone);
          } else {
            const message = getTextMessage(
              user.language,
              'notifFailed',
              [],
              'main'
            );
            await sendTextMessage(message, recipientPhone);
          }
        }
      } else {
        await sendTextMessage('Received Invalid Data', recipientPhone);
      }
    } else if (flowName === 'transferOwner') {
      const { employees1, employees2, employees3, employees4, employees5 } =
        flowMessage;

      const employees = [
        employees1,
        employees2,
        employees3,
        employees4,
        employees5,
      ]
        .flat()
        .filter((employeeId) => employeeId !== 'null');

      if (employees.includes('uploadContact')) {
        const message = getTextMessage(user.language, 'uploadNewOwner', []);
        await sendTextMessage(message, recipientPhone);
        session.get(recipientPhone).session = 'transferOwner';
      } else {
        const [
          employeeId,
          employeeNumber,
          employeeName,
          employeeRole,
          employeeLanguage,
        ] = employees[0].split('@');

        const transferLogs = await OwnerTransferLogs.create({
          status: 'pending',
          companyId: user.companyId,
          from: {
            time: moment.tz(new Date(), user.timeZone),
          },
          to: {
            time: moment.tz(new Date(), user.timeZone),
            priorType: employeeRole,
            employeeId,
          },
        });

        const { message, listOfButtons } = getSimpleButtonsMessage(
          employeeLanguage,
          'acceptowner',
          [employeeName, user.employerName, user.companyName]
        );
        await sendSimpleButtons(
          message,
          listOfButtons(
            `${employeeId}@${transferLogs._id.toString()}@${recipientPhone}@${employeeLanguage}@${employeeName}`
          ),
          employeeNumber
        );

        const confirmMes = getTextMessage(user.language, 'confirmSent', [
          employeeName,
        ]);
        await sendTextMessage(confirmMes, recipientPhone);
      }
    } else if (flowName === 'languages') {
      const { language } = flowMessage;

      if (user.isEmployee) {
        const res = await Employee.updateOne(
          {
            companyId: user.companyId,
            $or: [
              {
                employeeNumber: Number(recipientPhone),
                _id: user.employeeId,
              },
            ],
          },
          { language }
        );

        if (res.acknowledged) {
          if (sessionType === 'language-employeeSignup') {
            session.get(recipientPhone).session = 'employeeSignup';
            session.get(recipientPhone).language = language;

            const message = getTextMessage(language, 'timezoneLocation', []);
            await sendLocationCta({ message, recipientPhone });
          }
        }
      } else if (user.isEmployee === false) {
        const res = await Employer.updateOne(
          { _id: user.companyId },
          { language }
        );

        if (res.acknowledged) {
          session.delete(recipientPhone);
          const message = getTextMessage(language, 'languageUpdate', [
            language,
          ]);
          await sendTextMessage(message, recipientPhone);
        }
      }
    } else if (flowName === 'createIssue') {
      const { desctiption, issue } = flowMessage;

      const date = moment.tz(new Date(), user.timeZone);
      const ticketNumber = Math.floor(Math.random() * 90000) + 10000;

      const res = await Issue.create({
        date,
        ticketNumber,
        employeeId: user.employeeId,
        companyId: user.companyId,
        remark: desctiption,
        issueType: issue,
      });

      if (res) {
        const message = getTextMessage(user.language, 'issueSummary', [
          user.employeeName,
          issue,
          desctiption,
          recipientPhone,
          ticketNumber,
        ]);
        await sendTextMessage(message, recipientPhone);

        let employerLanguage = session.get(user.employerNumber)?.user?.language;

        if (!employerLanguage) {
          const employer = await Employer.findById(user.companyId, {
            language: 1,
          });
          employerLanguage = employer.language;
        }

        const { message: issueMessage, listOfButtons } =
          getSimpleButtonsMessage(employerLanguage, 'sendIssue', [
            user.employeeName,
            issue,
            desctiption,
            recipientPhone,
            ticketNumber,
          ]);
        await sendSimpleButtons(
          issueMessage,
          listOfButtons(
            `${res._id.toString()}_${recipientPhone}_${user.language}`
          ),
          user.employerNumber
        );
      } else {
        const message = getTextMessage(user.language, 'errorOccured', []);
        await sendTextMessage(message, recipientPhone);
      }
    } else if (flowName === 'issuesApprovals') {
      const { issues1, issues2, issues3, issues4, issues5, approveType } =
        flowMessage;

      const issues = [
        ...issues1,
        ...(issues2 || []),
        ...(issues3 || []),
        ...(issues4 || []),
        ...(issues5 || []),
      ].filter((issue) => issue !== 'null' && issue !== '');

      if (Array.isArray(issues) && issues.length > 0) {
        await Promise.allSettled(
          issues.map(async (issue) => {
            return await Issue.updateOne(
              { _id: issue },
              { status: approveType }
            );
          })
        );

        const message = getTextMessage(user.language, 'issuesUpdated', []);
        await sendTextMessage(message, recipientPhone);
      } else {
        const message = getTextMessage(user.language, 'errorOccured', []);
        await sendTextMessage(message, recipientPhone);
      }
    } else if (flowName === 'createdailytask') {
      const {
        prooftypephoto1,
        prooftypetext1,
        prooftypeaudio1,
        prooftypefile1,
        prooftypevideo1,
        proofoflocationlabel,
        noofprooftext,
        noofproofvideo,
        noofprooffile,
        noofproofphoto,
        noofproofaudio,
        // daysinweektask,
        taskactivityname,
        taskactivitydescription,
        taskactivityinstruction,
        assignto12,
        assignto13,
        assignto14,
        assignto11,
        priorityselected1,
        notifications,
        assignstrict1,
        proofstrict1,
        nooftimesperday,
        StartTime,
        taskduration,
      } = flowMessage;

      const assignees = [];

      if (assignstrict1 === 'assign_to_all') {
        const employees = await Employee.find(
          { companyId: user.companyId },
          { _id: 1, employeeNumber: 1 }
        );
        assignees.push(employees);
      } else {
        assignees.push([
          ...(!assignto11?.includes('null') || []),
          ...(!assignto12?.includes('null') || []),
          ...(!assignto13?.includes('null') || []),
          ...(!assignto14?.includes('null') || []),
        ]);
      }

      const proofs = {};

      proofs.text = prooftypetext1[0] === 'text_yes' ? noofprooftext : '';
      proofs.audio = prooftypeaudio1[0] === 'audio_yes' ? noofproofaudio : '';
      proofs.files = prooftypefile1[0] === 'file_yes' ? noofprooffile : '';
      proofs.video = prooftypevideo1[0] === 'video_yes' ? noofproofvideo : '';
      proofs.images = prooftypephoto1[0] === 'photo_yes' ? noofproofphoto : '';
      proofs.location =
        proofoflocationlabel === 'location_yes' ? 'as_per_user' : '';

      // const task = await DailyTasks.create({
      //   proofs,
      //   proofType: proofstrict1,
      //   priority: priorityselected1,
      //   assigneedTo: assignees,
      //   taskName: taskactivityname,
      //   taskDescription: taskactivitydescription,
      //   taskInstructions: taskactivityinstruction,
      //   notifications: {
      //     startTime: StartTime,
      //     timesPerDay: nooftimesperday,
      //     taskDuration: taskduration,
      //     type: notifications[0],
      //   },
      // });

      // if (!task) {
      //   return await sendTextMessage('Failed to create task', recipientPhone);
      // }

      // eslint-disable-next-line no-unused-vars
      const result = await createdailySOP(recipientPhone, flowMessage);

      const rootPath = process.env.ROOT_PATH;
      const fileName = `${recipientPhone}-createdailysop.pdf`;
      const filePath = path.join(rootPath, fileName);

      await sendDocument({
        caption: 'SOP',
        recipientPhone,
        file_path: `${filePath}`,
      });
    } else if (flowName === 'change-shift-timings-by-branch') {
      const { branchName } = flowMessage;

      const checkIn = new Date(
        1970,
        0,
        1,
        Number(flowMessage.checkIn.split(':')[0]),
        Number(flowMessage.checkIn.split(':')[1])
      );
      const checkOut = new Date(
        1970,
        0,
        1,
        Number(flowMessage.checkOut.split(':')[0]),
        Number(flowMessage.checkOut.split(':')[1])
      );

      const updateRes = await Employee.updateMany(
        { companyId: user.companyId, 'locations.name': branchName },
        { $set: { checkIn, checkOut } }
      );

      if (updateRes.acknowledged) {
        await sendTextMessage(
          `Shift Timings of all employees in branch ${branchName} has updated.`,
          recipientPhone
        );
      } else {
        await sendTextMessage(`Failed to update shift timings`, recipientPhone);
      }
    }
  }
);

async function sendDateRangeFlow(language, minDate, flowName, recipientPhone) {
  const currentTime = new Date().getTime();

  const message = getTextMessage(language, 'dateRangeReport', []);

  const { flow, flowBody } = getFlowMessageData(message);

  const flowData = {
    screen: 'Date_Range',
    data: {
      minDate: new Date(minDate).getTime().toString(),
      maxDate: currentTime.toString(),
      flowName,
      ...flow,
    },
  };

  await sendFlow({
    body: flowBody,
    flow_cta: 'Report',
    flow_data: flowData,
    flow_id: flowIds.dateRange,
    flow_token: FLOW_TOKEN,
    recipientPhone,
  });
}

function generateCheckboxRequests(checkboxes, result, key) {
  const arrs = splitArray(checkboxes, Object.keys(result).length);

  arrs.forEach((arr, i) => {
    result[`${key}${i + 1}`].push(...arr);
  });

  return result;
}

async function updateAttendance(data) {
  if (data.documentId === 'undefined') {
    const res = await Attendance.create(data);

    if (res) {
      return res._id;
    }

    return false;
  } else {
    const res = await Attendance.updateOne(
      { _id: data.documentId },
      {
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        creationType: data.creationType,
      }
    );

    if (res && res.acknowledged) {
      return data.documentId;
    }

    return false;
  }
}

function getIds(arrays) {
  return arrays.map((array) => {
    if (array.id === 'null') return '';
    else return array.id;
  });
}

function getFlowData(screenName, dynamicData, language, messageId) {
  const message = getTextMessage(language, messageId, []);
  const { flow, flowBody } = getFlowMessageData(message);

  return [
    {
      screen: screenName,
      data: {
        ...flow,
        ...dynamicData,
      },
    },
    flowBody,
  ];
}

function createFormattedString(userName, timingType, timing, shiftType) {
  const nameAbbreviation = `${userName.split(' ')[0].slice(0, 5)}${userName.split(' ')[1]?.charAt(0) ?? ''
    }`;

  const formattedTiming = timing?.replace(/^0/, '');

  let formattedString = `${nameAbbreviation} ${formattedTiming}-${timingType}-${shiftType === 'day' ? 'D' : 'N'
    }`;

  if (formattedString.length > 30) {
    return formattedString.slice(0, 30);
  }

  return formattedString;
}

function convertToFormattedObject(data, phonenumber) {
  const toData11 = data?.assignto11 || [];
  const toData12 = data?.assignto12 || [];
  const toData13 = data?.assignto13 || [];
  const toData14 = data?.assignto14 || [];

  let updatedData11 = []; // Initialize with an empty array

  if (toData12.includes('Self')) {
    updatedData11 = toData12.map((item) =>
      item === 'Self' ? phonenumber : item
    );
  } else {
    updatedData11 = toData12;
  }

  let originalArray = toData11.concat(updatedData11, toData13, toData14);

  originalArray = originalArray.filter((item) => item !== 'na');
  const newArray = originalArray.map((number) => {
    return {
      assignto: number,
      date: '12/4/32',
      remark: 'initial assign',
      acknowledge: 'no',
      status: 'pendingacceptance',
    };
  });

  const formattedObject = {
    phonenumber: data.companyid, // Assuming companyid is the phone number
    task: {
      name: data.taskactivityname,
      description: data.taskactivitydescription,
      activity: {
        instruction: data.taskactivityinstruction,
        duration: data.taskduration,
        timesPerDay: data.nooftimesperday,
      },
      proof: {
        proofstrict: data.proofstrict1,
        photo: {
          enabled: data.prooftypephoto1.includes('photo_yes'),
          count: data.noofproofphoto,
          submissions: [],
        },
        video: {
          enabled: data.prooftypevideo1.includes('video_yes'),
          count: data.noofproofvideo,
          submissions: [],
        },
        audio: {
          enabled: data.prooftypeaudio1.includes('audio_yes'),
          count: data.noofproofaudio,
          submissions: [],
        },
        text: {
          enabled: data.prooftypetext1.includes('text_yes'),
          count: data.noofprooftext,
          submissions: [],
        },
        file: {
          enabled: data.prooftypefile1.includes('file_yes'),
          count: data.noofprooffile,
        },
        location: {
          enabled: data.proofoflocationlabel === 'location_yes', // Change this condition based on your logic
          label: data.proofoflocationlabel,
          submissions: [],
        },
      },
      daysinweek: data.daysinweektask,
      notifications: data.notifications,
      priority: data.priorityselected1,
      assign: {
        assigntype: data.assignstrict1,
        proofstrict: data.proofstrict1,
        to: newArray,
      },

      startTime: data.StartTime,
    },
    flow: {
      token: data.flow_token,
      name: data.flowName,
    },
    logs: [
      {
        timestamp: new Date(),
        activity: 'taskcreation',
        by: phonenumber,
        // You can add more fields based on your logging needs
      },
    ],
    __v: 0,
  };

  return formattedObject;
}

function getMinDateForDateRange(date) {
  const currentDate = new Date();
  const twoMonthsAgo = new Date();

  twoMonthsAgo.setMonth(currentDate.getMonth() - 2);

  if (new Date(date) >= twoMonthsAgo) {
    return date;
  } else {
    return twoMonthsAgo.toISOString();
  }
}

export default handleFlowMessage;
