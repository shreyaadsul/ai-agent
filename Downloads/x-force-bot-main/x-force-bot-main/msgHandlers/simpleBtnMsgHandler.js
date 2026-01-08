import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import moment from 'moment-timezone';
import _ from 'lodash';

import { Whatsapp } from '../controllers/whatsappMessageController.js';

import {
  sendSimpleButtons,
  sendTextMessage,
  sendRadioButtons,
  sendDocument,
  sendFlow,
  sendLocationCta,
  sendLanguageFlow,
} from '../utils/messages.js';
import {
  EDIT_EMPLOYEE_FLOW_ID,
  EDIT_EMPLOYEE_FLOW_TOKEN,
  EDIT_TIMING_FLOW_ID,
  EDIT_TIMING_FLOW_TOKEN,
  EDIT_NOTIFICATIONS_FLOW_ID,
  EDIT_NOTIFICATIONS_FLOW_TOKEN,
  REMOVE_EMPLOYEES_FLOW_ID,
  REMOVE_EMPLOYEES_FLOW_TOKEN,
  REMOVE_BRANCH_FLOW_ID,
  REMOVE_BRANCH_FLOW_TOKEN,
  ONE_DAY_LEAVE_FLOW_ID,
  ONE_DAY_LEAVE_FLOW_TOKEN,
  MANY_DAY_LEAVE_FLOW_ID,
  MANY_DAY_LEAVE_FLOW_TOKEN,
  // EDIT_BUSINESS_FLOW_ID,
  // EDIT_BUSINESS_FLOW_TOKEN,
  EDIT_GEO_LOCATION_FLOW_ID,
  EDIT_GEO_LOCATION_FLOW_TOKEN,
  DATE_RANGE_FLOW_ID,
  DATE_RANGE_FLOW_TOKEN,
  // EMPLOYEE_FLOW_ID,
  // EMPLOYEE_FLOW_TOKEN,
  // LANGUAGES_FLOW_ID,
  // LANGUAGES_FLOW_TOKEN,
  EPOCH,
} from '../utils/constants.js';
import {
  getSimpleButtonsMessage,
  getTextMessage,
  getRadioButtonsMessage,
} from '../utils/languages.js';
import { sendEmployeeDemoTemplate } from '../utils/messages.js';

// import {
//   createEmployeeReport,
//   createAllEmployeeReport,
//   createLiveReport,
// } from '../reports.js';

import {
  Leave,
  Issue,
  Employer,
  Employee,
  Attendance,
  OwnerTransferLogs,
  CoownerLogs,
} from '../models/index.js';

import {
  getSixMonthsInMs,
  delay,
  deleteFile,
  getTimeZoneAwareDate,
  createEmployeeProperties,
  getFlowMessageData,
  timeIn12H,
  getRegisteredDate,
  getDepartmentButtonList,
} from '../utils/utils.js';

import flowIds, { FLOW_TOKEN } from '../utils/constants.js';

import sendAttendanceInOutButton from '../features/attendance/send-in-out-button.js';
import HandleAttendanceInOut from '../features/attendance/handle-in-out.js';

import { handleAttendanceUpdateStatus } from '../features/attendance/handle-update-status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootPath = path.dirname(__dirname);

const BOT = 'main';

const buttonMessageHandlers = {
  // MarkAttendance: async (buttonId, session, recipientPhone) => {
  //   await handleMarkAttendance({ buttonId, session, recipientPhone });
  // },
  // in: async (buttonId, session, recipientPhone) => {
  //   await handleIn({ buttonId, session, recipientPhone });
  // },
  // out: async (buttonId, session, recipientPhone) => {
  //   await handleIn({ buttonId, session, recipientPhone });
  // },
  requestLeave: async (buttonId, session, recipientPhone) => {
    await handleRequestLeave({ buttonId, session, recipientPhone });
  },
  oneDay: async (buttonId, session, recipientPhone) => {
    await handleOneDay({ buttonId, session, recipientPhone });
  },
  moreThanOneDay: async (buttonId, session, recipientPhone) => {
    await handleMoreThanOne({ buttonId, session, recipientPhone });
  },
  approvals: async (buttonId, session, recipientPhone) => {
    await handleApprovals({ buttonId, session, recipientPhone });
  },
  employerReports: async (buttonId, session, recipientPhone) => {
    await handleGetReport({ buttonId, session, recipientPhone });
  },
  leaveApprove: async (buttonId, session, recipientPhone) => {
    await handleLeaveApprove({ buttonId, session, recipientPhone });
  },
  activeIssues: async (buttonId, session, recipientPhone) => {
    await handleActiveIssues({ buttonId, session, recipientPhone });
  },
  liveReport: async (buttonId, session, recipientPhone) => {
    await handleLiveReport({ buttonId, session, recipientPhone });
  },
  Report: async (buttonId, session, recipientPhone) => {
    await handleReport({ buttonId, session, recipientPhone });
  },
  currentMonth: async (buttonId, session, recipientPhone) => {
    await handleCurrentMonth({ buttonId, session, recipientPhone });
  },
  previousMonth: async (buttonId, session, recipientPhone) => {
    await handlePreviousMonth({ buttonId, session, recipientPhone });
  },
  emp_master_sheet: async (buttonId, session, recipientPhone) => {
    await handleEmpMasterSheet({ buttonId, session, recipientPhone });
  },
  startempdemo: async (buttonId, session, recipientPhone) => {
    await handleEmpDemo({ buttonId, session, recipientPhone });
  },
  ai_chat: async (buttonId, session, recipientPhone) => {
    session.get(recipientPhone).session = ''; // Clear any stuck session
    await sendTextMessage("You are now connected to the AI Agent. Ask me anything!", recipientPhone);
  },
};

async function handleSimpleButtonMessage({
  buttonId,
  recipientPhone,
  session,
}) {
  const { user, session: sessionType } = session.get(recipientPhone);

  const handlerFunction = buttonMessageHandlers[buttonId];

  if (typeof handlerFunction == 'function') {
    await handlerFunction(buttonId, session, recipientPhone);
  }

  if (buttonId === 'mark_attendance') {
    await sendAttendanceInOutButton(buttonId, recipientPhone);
  } else if (buttonId === 'in' || buttonId === 'out') {
    await HandleAttendanceInOut(buttonId, recipientPhone);
  } else if (buttonId.startsWith('empFl')) {
    const date = moment.tz(new Date(), user.timeZone);
    const startDate = getRegisteredDate(user.createdAt, date);

    const monthStart = moment.tz(
      new Date(date.year(), date.month(), 1, 0, 0, 0),
      user.timeZone
    );
    const monthEnd = moment.tz(
      new Date(date.year(), date.month(), date.daysInMonth(), 0, 0, 0),
      user.timeZone
    );

    if (startDate !== -1) {
      monthStart.set('date', startDate);
      monthEnd.set('date', date.date());
    }

    const attendances = await Attendance.aggregate([
      {
        $match: {
          employeeId: user.employeeId,
          $and: [
            { date: { $gte: new Date(monthStart) } },
            { date: { $lte: new Date(monthEnd) } },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          year: { $year: { date: '$date', timezone: user.timeZone } },
          month: { $month: { date: '$date', timezone: user.timeZone } },
          day: { $dayOfMonth: { date: '$date', timezone: user.timeZone } },
          id: '$_id',
          checkIn: '$checkInTime',
          checkOut: '$checkOutTime',
        },
      },
    ]);
    const weekOffDays = getWeekOffDays(user.workDays);
    const workingDays = getWorkingDaysInMonth(monthStart, date, weekOffDays);

    let absentDays = _.differenceWith(
      workingDays,
      attendances.map((attendance) => [
        attendance.year,
        attendance.month,
        attendance.day,
      ]),
      _.isEqual
    );
    let forgetDays = attendances.filter(
      (attendance) => !attendance.checkIn || !attendance.checkOut
    );

    if (forgetDays.length > 0) {
      forgetDays = forgetDays.map((forgetDay) => {
        const desc = forgetDay.checkOut
          ? 'Forget To Check In: '
          : 'Forget to Check Out: ';

        const date = moment.tz(
          new Date(forgetDay.year, forgetDay.month - 1, forgetDay.day, 0, 0, 0),
          user.timeZone
        );
        return {
          id: `${forgetDay.id}@${date.toJSON()}`,
          title: date.format('DD/MM/YYYY'),
          description: `${desc} ${date.format('DD/MM/YYYY')}`,
        };
      });
    } else {
      forgetDays = [
        {
          id: 'null',
          title: 'No Data',
          description: 'No Data Found',
        },
      ];
    }

    if (absentDays.length > 0) {
      absentDays = absentDays.map((absentDay) => {
        const date = moment.tz(
          new Date(absentDay[0], absentDay[1] - 1, absentDay[2], 0, 0, 0),
          user.timeZone
        );

        return {
          id: date.toDate(),
          title: date.format('DD/MM/YYYY'),
          description: `Not Marked on: ${date.format('DD/MM/YYYY')}`,
        };
      });
    } else {
      absentDays = [
        {
          id: 'null',
          title: 'No Data',
          description: 'No Data Found',
        },
      ];
    }

    const message = getTextMessage(
      user.language,
      'employeeManagement',
      [],
      BOT
    );
    const { flow, flowBody } = getFlowMessageData(message);

    const flowData = {
      screen: 'Employee_Management',
      data: {
        ...flow,
        markOnDutyDropdown: absentDays,
        forgetInOutDropdown: forgetDays,
        init_values: {
          userData: buttonId.split('@')[1],
        },
        role: user.role,
        userData: buttonId.split('@')[1],
        hodReportsRadio: []
      },
    };

    console.log(flowData.data)

    if (user.role === 'coowner') {
      flowData.data.extraReportsLabel = "Coowner Reports"
    } else if (user.role === 'hod') {
      flowData.data.extraReportsLabel = "Department Reports"
    }

    if (user.role === 'coowner' || user.role === 'hod') {
      const message = getTextMessage(user.language, 'extraReports');

      if (user.language.includes('+')) {
        flowData.data.hodReportsRadio.push(...message.messageTwo.label);
      } else {
        flowData.data.hodReportsRadio.push(...message.label);
      }

      if (
        user.role === 'hod'
      ) {
        flowData.data.reportsRadio.push({
          id: 'manual_punching',
          title: 'Manual Punching',
        });
      }
    }

    await sendFlow({
      body: flowBody,
      flow_cta: 'Manage',
      flow_data: flowData,
      flow_id: flowIds.employeeFlow,
      flow_token: FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId === 'other') {
    console.log(`[BUTTON HANDLER] "Other" button clicked. User: ${recipientPhone}`);
    const { message, listOfButtons } = getSimpleButtonsMessage(
      user.language,
      buttonId,
      [],
      BOT
    );
    await sendSimpleButtons(message, listOfButtons, recipientPhone);
  } else if (
    buttonId.startsWith('half-day') ||
    buttonId.startsWith('full-day') ||
    buttonId.startsWith('absent')
  ) {
    const [status, attendanceDocId] = buttonId.split('@');

    await handleAttendanceUpdateStatus(
      attendanceDocId,
      status,
      recipientPhone,
      user.timeZone
    );
  } else if (buttonId === 'support') {
    const { message, listOfSections } = getRadioButtonsMessage(
      user.language,
      buttonId,
      [],
      BOT
    );
    const buttonname = 'Select Support Type';
    await sendRadioButtons(message, listOfSections, recipientPhone, buttonname);
  } else if (buttonId.startsWith('addEmp')) {
    await addEmployee({ buttonId, session, recipientPhone });
  } else if (buttonId.startsWith('editEmp')) {
    await handleEditEmployee({ buttonId, session, recipientPhone });
  } else if (buttonId.startsWith('request_')) {
    await handleUpdateLeaveRequest({ buttonId, session, recipientPhone });
  } else if (buttonId.startsWith('issue_')) {
    await handleUpdateIssue({ buttonId, session, recipientPhone });
  } else if (
    buttonId.startsWith('singlelanguage') ||
    buttonId.startsWith('duallanguage')
  ) {
    const [messageId, userData] = buttonId.split('@');
    await sendLanguageFlow(messageId, recipientPhone, userData);

    session.get(recipientPhone).session = `language-${sessionType}`;

    // const message = " *Choose your preferred language.* ";
  } else if (buttonId === 'employe_report1') {
    await sendDocument({
      recipientPhone,
      caption: 'Current Month Report',
      file_path: path.join(rootPath, '/public/EmployeeCurrentMonth.pdf'),
    });

    await delay(3000);

    const demoCompletedMessage = getTextMessage(
      user.language,
      'employeeDemoCompleted',
      [],
      BOT
    );

    await Whatsapp.sendImage({
      recipientPhone,
      caption: demoCompletedMessage,
      url: 'https://i.postimg.cc/mkDw3z3t/Copy-of-Hi.png',
    });

    session.delete(recipientPhone);
  } else if (buttonId === 'profile-settings') {
    const { listOfButtons, message } = getSimpleButtonsMessage(
      user.language,
      buttonId,
      [],
      BOT
    );

    await sendSimpleButtons(message, listOfButtons, recipientPhone);
  } else if (buttonId === 'business-settings') {
    const message = getTextMessage(user.language, buttonId, [], BOT);

    const flowData = {
      screen: 'Edit_Business',
      data: { ...message.label },
    };

    const { user } = session.get(recipientPhone);

    const employer = await Employer.findOne({
      employerNumber: user.companyNumber,
      _id: user.companyId,
    });

    if (employer) {
      flowData.data['init_values'] = {
        employerName: employer.fullName,
        employerNumber: `${employer.employerNumber}`,
        companyName: employer.companyName,
        bufferTime: String(employer.bufferTime),
        monthlySickLeave: employer.monthlySickLeave,
        casualLeave: employer.casualLeave,
        carryForwardLimit: employer.carryForwardLimit,
        annualLeave: employer.annualLeave,
        maternityLeaveAllowed: employer.maternityLeaveAllowed,
        paternityLeaveAllowed: employer.paternityLeaveAllowed,
        unpaidLeavePolicy: employer.unpaidLeavePolicy,
        leaveEncashment: employer.leaveEncashment,
        consequencesUnapprovedLeave: employer.consequencesUnapprovedLeave,
        halfDayPolicy: employer.halfDayPolicy,
        language: employer.language,
      };
    }

    // await sendFlow({
    //   body: message.body,
    //   flow_cta: "Update",
    //   flow_data: flowData,
    //   flow_id: EDIT_BUSINESS_FLOW_ID,
    //   flow_token: EDIT_BUSINESS_FLOW_TOKEN,
    //   recipientPhone,
    // });
  } else if (buttonId === 'edit-delete') {
    const { listOfButtons, message } = getSimpleButtonsMessage(
      user.language,
      buttonId,
      [],
      BOT
    );
    await sendSimpleButtons(message, listOfButtons, recipientPhone);
  } else if (buttonId === 'edit-timings') {
    const { user } = session.get(recipientPhone);
    let employees = await Employee.findEmployees(user.companyId);

    if (!employees || employees.length === 0) {
      employees = {
        employeeList1: [{ id: 'noEmployees', title: 'No Employees' }],
        employeeList2: [{ id: 'noEmployees', title: '' }],
        employeeList3: [{ id: 'noEmployees', title: '' }],
        employeeList4: [{ id: 'noEmployees', title: '' }],
      };
    } else if (employees.length > 0) {
      employees = createEmployeeProperties(employees);
    }

    const message = getTextMessage(user.language, buttonId, [], BOT);

    const flowData = {
      screen: 'Edit_Timings',
      data: {
        ...message.label,
        init_values: {
          workinghours: '09:00',
          checkin: '09:30',
          checkout: '18:30',
          workdays: [...employees.workDays.map(String)],
        },
        ...employees,
        shiftTyperadio: [
          {
            id: 'day',
            title: 'Day Shift (D)',
          },
          {
            id: 'day/night',
            title: 'Day/Night Shift (N)',
          },
        ],
        timingTyperadio: [
          {
            id: 'Flexible',
            title: 'Flexible Timing',
          },
          {
            id: 'Fixed',
            title: 'Fixed Timing',
          },
        ],
        workdaysList: [
          {
            id: '0',
            title: 'Sunday',
          },
          {
            id: '1',
            title: 'Monday',
          },
          {
            id: '2',
            title: 'Tuesday',
          },
          {
            id: '3',
            title: 'Wednesday',
          },
          {
            id: '4',
            title: 'Thursday',
          },
          {
            id: '5',
            title: 'Friday',
          },
          {
            id: '6',
            title: 'Saturday',
          },
        ],
      },
    };

    await sendFlow({
      body: message.body,
      flow_cta: 'Edit Timings',
      flow_data: flowData,
      flow_id: EDIT_TIMING_FLOW_ID,
      flow_token: EDIT_TIMING_FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId === 'notification-settings') {
    const { message, listOfButtons } = getSimpleButtonsMessage(
      user.language,
      buttonId,
      [],
      BOT
    );
    await sendSimpleButtons(message, listOfButtons, recipientPhone);
  } else if (buttonId === 'edit-notifs') {
    let notifications;

    if (!user.notifications) {
      notifications = await Employer.findNotfications(user.companyId);
    }

    const message = getTextMessage(
      user.language,
      buttonId,
      [user.companyName],
      BOT
    );

    const flowData = {
      screen: 'Edit_Notifications',
      data: {
        ...message.label,
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
        all_extras: [
          {
            id: 'checkIn',
            title: 'Check-Ins',
          },
          {
            id: 'checkOut',
            title: 'Check-Outs',
          },
          {
            id: 'leaveRequest',
            title: 'Leave Requests',
          },
          {
            id: 'support',
            title: 'Support Requests',
          },
        ],
      },
    };

    await sendFlow({
      body: message.body,
      flow_cta: 'Update',
      flow_data: flowData,
      flow_id: EDIT_NOTIFICATIONS_FLOW_ID,
      flow_token: EDIT_NOTIFICATIONS_FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId === 'remove-employees') {
    const { user } = session.get(recipientPhone);
    const message = getTextMessage(
      user.language,
      buttonId,
      [user.companyName],
      BOT
    );

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
        ...message.label,
        ...employees,
      },
    };

    await sendFlow({
      body: message.body,
      flow_cta: 'Remove',
      flow_data: flowData,
      flow_id: REMOVE_EMPLOYEES_FLOW_ID,
      flow_token: REMOVE_EMPLOYEES_FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId === 'remove-branch') {
    const { user } = session.get(recipientPhone);
    const message = getTextMessage(user.language, buttonId, [], BOT);

    let { locations, employees } = await Employee.findLocationsAndEmployees(
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

    const flowData = {
      screen: 'Remove_Branch',
      data: {
        ...message.label,
        branch: [
          { id: 'Any Location', title: 'Any Location' },
          ...[...locations].map((location) => ({
            id: location,
            title: location,
          })),
        ],
        ...employees,
      },
    };

    await sendFlow({
      body: message.body,
      flow_cta: 'Remove',
      flow_data: flowData,
      flow_id: REMOVE_BRANCH_FLOW_ID,
      flow_token: REMOVE_BRANCH_FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId === 'yesGeoFencing') {
    const message = getTextMessage(user.language, buttonId, [], BOT);
    await sendLocationCta({
      message,
      recipientPhone,
    });
    session.get(recipientPhone).session = 'addBranch';
  } else if (buttonId === 'no-geofencing') {
    const message = getTextMessage(user.language, 'uploadEmployee', [], BOT);
    await Whatsapp.sendImage({
      recipientPhone,
      caption: message,
      url: 'https://i.ibb.co/Njkhcnb/5dc415a6-1caf-45d9-8f65-f41188215194.jpg',
    });
  } else if (buttonId === 'edit-geo-fencing') {
    const { user } = session.get(recipientPhone);

    let employees = await Employee.findEmployees(user.companyId);
    let { branch: locations } = await Employer.findBranch(
      recipientPhone,
      user.companyId
    );

    if (!employees || employees.length === 0) {
      employees = {
        employeeList1: [{ id: 'noEmployees', title: 'No Employees' }],
        employeeList2: [{ id: 'noEmployees', title: '' }],
        employeeList3: [{ id: 'noEmployees', title: '' }],
        employeeList4: [{ id: 'noEmployees', title: '' }],
      };
    } else if (employees.length > 0) {
      employees = createEmployeeProperties2(employees);
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
      screen: 'Edit_Geo_Fencing',
      data: {
        timingTypeLabel: 'Timing Type',
        branchLabel: 'Places',
        employeesLabel: 'Employees',
        branches: locations,
        ...employees,
      },
    };

    await sendFlow({
      body: 'Edit Geo Fencing of Employees by clicking the below button',
      flow_cta: 'Edit Locations',
      flow_data: flowData,
      flow_id: EDIT_GEO_LOCATION_FLOW_ID,
      flow_token: EDIT_GEO_LOCATION_FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId === 'delete') {
    const { message, listOfButtons } = getSimpleButtonsMessage(
      user.language,
      buttonId,
      [],
      BOT
    );
    await sendSimpleButtons(message, listOfButtons, recipientPhone);
  } else if (buttonId === 'yesterdayReport') {
    // let { companyId, language, timeZone } = session.get(recipientPhone).user;
    let language = user.language.split('+')?.[1] ?? user.language;

    // const isLiveReport = await createLiveReport(
    //   recipientPhone,
    //   user.companyId,
    //   language,
    //   user.timeZone,
    //   'yesterday'
    // );

    // if (isLiveReport) {
    //   await sendDocument({
    //     recipientPhone,
    //     file_path: path.join(rootPath, `${recipientPhone}-liveReport.pdf`),
    //     caption: 'Live Report',
    //   });
    //   await deleteFile(`${recipientPhone}-liveReport.pdf`);
    // } else {
    //   await sendTextMessage('No data', recipientPhone);
    // }
  } else if (buttonId === 'dateRangeReport') {
    // const { registeredOn } = session.get(recipientPhone).user;
    const currentTime = new Date().getTime();

    const message = getTextMessage(user.language, buttonId, [], BOT);

    const flowData = {
      screen: 'Date_Range',
      data: {
        minDate: user.registeredOn.toString(),
        maxDate: currentTime.toString(),
        ...message.label,
      },
    };

    await sendFlow({
      body: message.body,
      flow_cta: 'Report',
      flow_data: flowData,
      flow_id: DATE_RANGE_FLOW_ID,
      flow_token: DATE_RANGE_FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId.startsWith('logs')) {
    const [, docId] = buttonId.split('-');
    const { logText, logPicUrl, logDocUrl, user } = session.get(recipientPhone);

    let log = {};

    if (logText) {
      log = { type: 'text', log: logText };
    } else if (logPicUrl) {
      log = { type: 'image', log: logPicUrl };
    } else if (logDocUrl) {
      log = { type: 'document', log: logDocUrl };
    }

    const att = await Attendance.findByIdAndUpdate(
      docId,
      {
        $push: {
          logs: [
            {
              logType: log.type,
              log: log.log,
              time: moment.tz(new Date(), user.timeZone),
            },
          ],
        },
      },
      { new: true }
    );

    if (att) {
      const message = getTextMessage(user.language, 'logsUpdated', [], BOT);
      await sendTextMessage(message, recipientPhone);
    }

    session.delete(recipientPhone);
  } else if (buttonId === 'chatWithAI') {
    //
  } else if (buttonId.startsWith('att-corr')) {
    const [, status, documentId, employeeNumber, employeeLanguage, timeZone] =
      buttonId.split('@');
    const res = await Attendance.findByIdAndUpdate(
      documentId,
      {
        $set: {
          'creationType.status': status,
        },
      },
      { new: true, checkInTime: 1, checkOutTime: 1, date: 1 }
    );

    const time = timeIn12H(timeZone);

    const momentDate = moment.tz(new Date(res.date), timeZone);
    const checkInTime = time(res.checkInTime);
    const checkOutTime = time(res.checkOutTime);

    if (res) {
      let message = getTextMessage(
        user.language,
        'requestUpdated',
        [status],
        BOT
      );
      await sendTextMessage(message, recipientPhone);

      message = getTextMessage(employeeLanguage, 'attReqUpdate', [
        status,
        momentDate.format('DD/MM/YY'),
        checkInTime,
        checkOutTime,
      ]);
      await sendTextMessage(message, employeeNumber);
    }
  } else if (buttonId.startsWith('coowner')) {
    const [, status, employeeId, rights, employerNumber] = buttonId.split('@');

    if (status === 'accept') {
      const res = await Employee.updateOne(
        { _id: employeeId },
        { role: 'coowner', rights }
      );

      if (res && res.acknowledged) {
        const message = getTextMessage(
          user.language,
          'coownerAccepted',
          [],
          BOT
        );
        await sendTextMessage(message, recipientPhone);
      }
    } else if (status === 'reject') {
      const message = getTextMessage(user.language, 'coownerRejected', [], BOT);
      await sendTextMessage(message, recipientPhone);
      // await sendTextMessage(
      //   "You have rejected the request to become a coowner. employer will be notified of your action.",
      //   recipientPhone
      // );
    }

    const message = getTextMessage(user.language, 'coownerUpdated', [], BOT);
    await sendTextMessage(message, employerNumber);
  } else if (buttonId.startsWith('empOwn')) {
    const [, action, employeeId, employeeNumber, logId] = buttonId.split('@');

    let emp = session.get(employeeNumber);

    if (!emp) {
      emp = await Employee.findOne({ _id: employeeId, employeeName: 1 });
    }

    if (action === 'continue') {
      const { message, listOfButtons } = getSimpleButtonsMessage(
        emp.language,
        'acceptowner',
        [emp.employeeName, '', emp.companyName]
      );
      await sendSimpleButtons(
        message,
        listOfButtons(
          `${employeeId}@${recipientPhone}@${logId}@${emp.language}@${emp.employeeName}`
        ),
        employeeNumber
      );

      const confirmMsg = getTextMessage(
        user.language,
        'confirmSent',
        [emp.employeeName],
        BOT
      );
      await sendTextMessage(confirmMsg, recipientPhone);
    } else if (action === 'cancel') {
      const message = 'Tranfer Ownership operation cancelled.';
      await sendTextMessage(message, recipientPhone);
      await OwnerTransferLogs.findByIdAndUpdate(logId, { status: 'cancelled' });
      session.delete(recipientPhone);
    }
  } else if (buttonId.startsWith('addOwn')) {
    const [, action, employeeId, logId, employerNumber, , employeeName] =
      buttonId.split('@');

    if (action === 'accept') {
      if (employeeId == 'undefined') {
        const newOwner = await Employer.updateOne(
          { employerNumber: Number(employerNumber) },
          {
            employerNumber: recipientPhone,
            fullName: employeeName,
            language: 'English',
          }
        );

        if (newOwner) {
          const update = await Employee.updateMany(
            { companyId: newOwner.companyId },
            { employerNumber: recipientPhone }
          );

          if (update && update.acknowledged) {
            let message = getTextMessage(newOwner.language, 'ownerRemoved', [
              employeeName,
            ]);
            await sendTextMessage(message, employerNumber);
            message = getTextMessage('English', 'newOwnerSuccess', [
              newOwner.companyName,
            ]);
            await sendTextMessage(message, recipientPhone);

            await OwnerTransferLogs.findByIdAndUpdate(logId, {
              'to.updatedAt': moment.tz(new Date(), newOwner.timeZone),
              status: 'accepted',
            });

            session.delete(recipientPhone);
            session.delete(employerNumber);
          }
        }
      } else {
        const employee = await Employee.findByIdAndDelete(employeeId);

        if (employee) {
          const owner = await Employer.findByIdAndUpdate(user.companyId, {
            employerNumber: recipientPhone,
            fullName: employee.employeeName,
          });

          if (owner) {
            const update = await Employee.updateMany(
              { companyId: owner.companyId },
              { employerNumber: recipientPhone }
            );

            if (update.acknowledged) {
              let message = getTextMessage(owner.language, 'ownerSuccess', [
                employee.employeeName,
              ]);
              await sendTextMessage(message, employerNumber);

              message = getTextMessage(user.language, 'newOwnerSuccess', [
                owner.companyName,
              ]);
              await sendTextMessage(message, recipientPhone);

              await OwnerTransferLogs.findByIdAndUpdate(logId, {
                'to.updatedAt': moment.tz(new Date(), owner.timeZone),
                status: 'accepted',
              });
            }
          }
        }

        session.delete(recipientPhone);
        session.delete(employerNumber);
      }
    } else if (action === 'reject') {
      const transferLog = await OwnerTransferLogs.findOne({
        _id: logId,
        status: 'pending',
      });

      if (transferLog) {
        await transferLog.updateOne({ status: 'rejected' });

        let message = getTextMessage(user.language, 'addOwnCancelled');
        await sendTextMessage(message, recipientPhone);

        let employerLanguage = session.get(employerNumber)?.user?.language;

        if (!employerLanguage) {
          const employer = await Employer.findOne(
            { employerNumber },
            { language: 1 }
          );
          employerLanguage = employer.language;
        }

        message = getTextMessage(employerLanguage, 'addOwnRejected', [
          employeeName,
        ]);
        await sendTextMessage(message, employerNumber);
      } else {
        const message = getTextMessage(user.language, 'addOwnCancelled');
        await sendTextMessage(message, recipientPhone);
      }
    }
  } else if (buttonId.startsWith('delAcc')) {
    const [, action, companyId] = buttonId.split('@');

    if (action === 'confirm') {
      const delRes = await Employer.deleteOne({ _id: companyId });

      if (delRes.acknowledged) {
        const res = await Employee.deleteMany({ companyId });

        if (res.acknowledged) {
          const message = await getTextMessage(
            user.language,
            'accDeleted',
            [],
            BOT
          );
          await sendTextMessage(message, recipientPhone);
          session.delete(recipientPhone);
        }
      }
    } else if (action === 'cancel') {
      const message = await getTextMessage(
        user.language,
        'deleteCancel',
        [],
        BOT
      );
      await sendTextMessage(message, recipientPhone);
    }
  } else if (buttonId.startsWith('addCoOwn')) {
    const [, action, employeeId, employerNumber, employeeName, logId] =
      buttonId.split('@');

    const user = session.get(recipientPhone)?.user;
    let employer = session.get(employerNumber)?.user;

    if (!employer) {
      employer = await Employer.findOne({
        employerNumber: Number(employerNumber),
      });
      session.set(employerNumber, {
        user: {
          ...employer._doc,
          companyId: employer._id.toString(),
        },
      });
      employer = session.get(employerNumber).user;
    }

    if (action === 'accept') {
      if (employeeId == 'undefined') {
        const employee = await Employee.create({
          employeeNumber: Number(recipientPhone),
          employeeName: employeeName,
          employerNumber: Number(employerNumber),
          companyId: employer.companyId,
          companyName: employer.companyName,
          role: 'coowner',
          checkIn: new Date(1970, 0, 1, 9, 30),
          checkOut: new Date(1970, 0, 1, 18, 30),
          requiredHours: new Date(1970, 0, 1, 9, 0),
        });

        if (employee) {
          let message = getTextMessage(employer.language, 'coOwnerSuccess', [
            employeeName,
          ]);
          await sendTextMessage(message, employerNumber);
          message = getTextMessage('English', 'coownerAccepted');
          await sendTextMessage(message, recipientPhone);

          await CoownerLogs.findByIdAndUpdate(logId, {
            'to.updatedAt': new Date(),
            status: 'accepted',
          });
        }
      } else {
        const employee = await Employee.findOneAndUpdate(
          { _id: employeeId },
          {
            role: 'coowner',
          }
        );

        if (employee) {
          let message = getTextMessage(employer.language, 'coOwnerSuccess', [
            employee.employeeName,
          ]);
          await sendTextMessage(message, employerNumber);

          message = getTextMessage(employee.language, 'coownerAccepted');
          await sendTextMessage(message, recipientPhone);

          await CoownerLogs.findByIdAndUpdate(logId, {
            'to.updatedAt': new Date(),
            status: 'accepted',
          });
        }

        session.delete(recipientPhone);
        session.delete(employerNumber);
      }
    } else if (action === 'reject') {
      const transferLog = await CoownerLogs.findOne({
        _id: logId,
        status: 'pending',
      });

      if (transferLog) {
        await transferLog.updateOne({ status: 'rejected' });

        let message;

        if (employeeId === 'undefined') {
          message = getTextMessage('English', 'coownerRejected');
        } else {
          message = getTextMessage(user?.language, 'coownerRejected');
        }
        await sendTextMessage(message, recipientPhone);

        message = getTextMessage(employer.language, 'addCoOwnRejected', [
          employeeName,
        ]);
        await sendTextMessage(message, employerNumber);
      } else {
        const message = getTextMessage(user?.language, 'noAction');
        await sendTextMessage(message, recipientPhone);
      }
    }

    session.delete(employerNumber);
    session.delete(recipientPhone);
  } else if (buttonId.startsWith('empCoOwn')) {
    const [, action, employeeId, employeeNumber, logId] = buttonId.split('@');

    let emp = session.get(employeeNumber);

    if (!emp) {
      emp = await Employee.findOne({ _id: employeeId });
    }

    if (action === 'continue') {
      const { message, listOfButtons } = getSimpleButtonsMessage(
        emp.language,
        'coownerRequest',
        [emp.employeeName, emp.companyName, emp.companyName]
      );

      await sendSimpleButtons(
        message,
        listOfButtons(
          `${employeeId}@${recipientPhone}@${emp.employeeName}@${logId}`
        ),
        employeeNumber
      );

      const confirmMsg = getTextMessage(
        user.language,
        'confirmSent',
        [emp.employeeName],
        BOT
      );
      await sendTextMessage(confirmMsg, recipientPhone);
    } else if (action === 'cancel') {
      const message = getTextMessage(
        user.language,
        'addcoownerCancelled',
        [emp.employeeName],
        BOT
      );
      await sendTextMessage(message, recipientPhone);

      await OwnerTransferLogs.updateOne(
        { _id: logId },
        { status: 'cancelled' }
      );
      session.delete(recipientPhone);
    }
  }
}

// async function handleMarkAttendance({ buttonId, session, recipientPhone }) {
//   session.get(recipientPhone).action = buttonId;

//   const {
//     user: { language, companyId, employeeId, shiftType },
//   } = session.get(recipientPhone);

//   let attendanceExists;
//   let { message, listOfButtons } = getSimpleButtonsMessage(language, buttonId, [], BOT);

//   if (shiftType === "day/night") {
//     const date = new Date();

//     attendanceExists = await Attendance.find({
//       employeeId,
//       companyId,
//       date: {
//         $eq: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
//       },
//     });

//     if (attendanceExists.length === 0) {
//       date.setDate(date.getDate() - 1);

//       attendanceExists = await Attendance.find({
//         employeeId,
//         companyId,
//         date: {
//           $eq: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
//         },
//       });

//       if (attendanceExists.length === 0) {
//         listOfButtons = listOfButtons.filter((button) => button.id === "in");
//       } else if (attendanceExists.length > 0) {
//         attendanceExists = attendanceExists[attendanceExists.length - 1];

//         if (attendanceExists.checkInTime && attendanceExists.checkOutTime) {
//           listOfButtons = listOfButtons.filter((button) => button.id === "in");
//         } else {
//           listOfButtons = listOfButtons.filter((button) => button.id === "out");
//         }
//       }
//     } else if (attendanceExists.length > 0) {
//       attendanceExists = attendanceExists[attendanceExists.length - 1];

//       if (attendanceExists.checkInTime && attendanceExists.checkOutTime) {
//         listOfButtons = listOfButtons.filter((button) => button.id === "in");
//       } else {
//         listOfButtons = listOfButtons.filter((button) => button.id === "out");
//       }
//     }
//   } else {
//     attendanceExists = await Attendance.findAttendance(employeeId, companyId);

//     if (attendanceExists.length === 0) {
//       listOfButtons = listOfButtons.filter((button) => button.id === "in");
//     } else if (attendanceExists) {
//       if (attendanceExists.checkInTime && attendanceExists.checkOutTime) {
//         listOfButtons = listOfButtons.filter((button) => button.id === "in");
//       } else {
//         listOfButtons = listOfButtons.filter((button) => button.id === "out");
//       }
//     }
//   }

//   await sendSimpleButtons(message, listOfButtons, recipientPhone);
// }

// async function handleIn({ buttonId, session, recipientPhone }) {
//   const { user } = session.get(recipientPhone);
//   const { language, proof } = user;

//   session.get(recipientPhone).action = buttonId;

//   if (proof.location) {
//     const message = getTextMessage(language, buttonId, [], BOT);

//     await sendLocationCta({ message, recipientPhone });

//     // await Whatsapp.sendImage({
//     //   recipientPhone,
//     //   caption: message,
//     //   url: "https://i.ibb.co/YZqQd4w/Copy-of-Hi-2.png",
//     // });
//   } else if (proof.image) {
//     session.get(recipientPhone).latitude = "0";
//     session.get(recipientPhone).longitude = "0";

//     session.get(recipientPhone).session = "markAttendance";

//     const message = getTextMessage(language, "attendanceLocation", [], BOT);
//     await sendTextMessage(message, recipientPhone);
//   } else {
//     const { name, address } = await markAttendance(buttonId, recipientPhone, {}, user);
//     await sendTextMessage(`${address}\n${name}`, recipientPhone);
//   }
// }

async function handleRequestLeave({ buttonId, session, recipientPhone }) {
  session.get(recipientPhone).action = buttonId;
  session.get(recipientPhone).session = 'requestLeave';

  const { language } = session.get(recipientPhone).user;
  const { message, listOfButtons } = getSimpleButtonsMessage(
    language,
    buttonId,
    [],
    BOT
  );

  await sendSimpleButtons(message, listOfButtons, recipientPhone);
}

async function handleOneDay({ buttonId, session, recipientPhone }) {
  session.get(recipientPhone).leave = buttonId;
  session.get(recipientPhone).leave_type = 'single_day';

  const message = getTextMessage(
    session.get(recipientPhone).user.language,
    buttonId,
    [],
    BOT
  );

  const currentDate = new Date();
  const maxDateObj = new Date(currentDate);
  maxDateObj.setMonth(maxDateObj.getMonth() + 6);

  const flowData = {
    screen: 'Request_Leave_One',
    data: {
      title: "Request Leave",
      minDate: currentDate.toISOString().split('T')[0],
      maxDate: maxDateObj.toISOString().split('T')[0],

      // Ensure these labels are explicitly defined
      startdatelabel: "Start Date",
      reasonlabel: "Reason For Leave",

      userData: 'leave_request',

      // Must be an OBJECT {}, not an array []
      init_values: {
        userData: 'leave_request'
      }
    }
  };
  await sendFlow({
    body: message.body,
    flow_id: ONE_DAY_LEAVE_FLOW_ID,
    flow_token: FLOW_TOKEN,
    flow_cta: 'Select Date',
    flow_data: flowData,
    recipientPhone,
    draft: true,
  });
}

async function handleMoreThanOne({ buttonId, session, recipientPhone }) {
  session.get(recipientPhone).leave = buttonId;
  session.get(recipientPhone).leave_type = 'multiple_days';

  const message = getTextMessage(
    session.get(recipientPhone).user.language,
    buttonId,
    [],
    BOT
  );

  const currentDate = new Date();
  const maxDateObj = new Date(currentDate);
  maxDateObj.setMonth(maxDateObj.getMonth() + 6);

  const flowData = {
    screen: 'Request_Leave_Many',
    data: {
      title: "Leave Application",
      minDate: currentDate.toISOString().split('T')[0],
      maxDate: maxDateObj.toISOString().split('T')[0],

      // Updated labels based on user example
      startdatelabel: "From Date",
      enddatelabel: "To Date",
      reasonlabel: "Reason for Many Day Leave",

      userData: 'leave_request',
      init_values: {
        userData: 'leave_request'
      },
    },
  };

  console.log('[handleMoreThanOne] Sending Flow Data:', JSON.stringify(flowData, null, 2));

  await sendFlow({
    body: message.body,
    flow_id: MANY_DAY_LEAVE_FLOW_ID,
    flow_token: FLOW_TOKEN,
    flow_cta: 'Pick a Date',
    flow_data: flowData,
    recipientPhone,
    draft: true,
  });
}

async function handleUpdateLeaveRequest({ buttonId, session, recipientPhone }) {
  const { user } = session.get(recipientPhone);
  const [, status, docId, employeeNumber, userLanguage] = buttonId.split('_');

  // const leave = JSON.parse(leaveJson);

  const res = await Leave.findByIdAndUpdate(docId, { status }, { ticketNo: 1 });

  if (res) {
    const language = user.language;
    const message = getTextMessage(
      language,
      'ticketUpdate',
      [res.ticketNo],
      BOT
    );

    await sendTextMessage(message, recipientPhone);

    const empMsg = getTextMessage(userLanguage, `request_${status}`, [], BOT);
    await sendTextMessage(empMsg, employeeNumber);
  } else {
    await sendTextMessage('Failed to update status', recipientPhone);
  }
}

async function handleApprovals({ buttonId, recipientPhone, session }) {
  const { language } = session.get(recipientPhone).user;

  const { message, listOfButtons } = getSimpleButtonsMessage(
    language,
    buttonId,
    [],
    BOT
  );

  await sendSimpleButtons(message, listOfButtons, recipientPhone);
}

async function handleGetReport({ buttonId, session, recipientPhone }) {
  const { language } = session.get(recipientPhone).user;

  const { message, listOfSections } = getRadioButtonsMessage(
    language,
    buttonId,
    [],
    BOT
  );

  await sendRadioButtons(message, listOfSections, recipientPhone, 'Reports');
}

async function handleLeaveApprove({ session, recipientPhone }) {
  const { user } = session.get(recipientPhone);
  const leaves = await Leave.findActiveLeaves(user.companyId);

  if (leaves && leaves.length > 0) {
    await Promise.allSettled(
      leaves.map(async (leave) => {
        const { leaveType, reason, from, to, ticketNo, employeeId } = leave;

        const employee = await Employee.findOne(
          { _id: employeeId, companyId: user.companyId, isActive: true },
          { employeeName: 1, employeeNumber: 1 }
        );

        const [startDate] = getTimeZoneAwareDate(user.timezone, from);
        const [endDate] = to
          ? getTimeZoneAwareDate(user.timezone, to)
          : ['Invalid Date'];

        const { message, listOfButtons } = getSimpleButtonsMessage(
          user.language,
          'sendLeave',
          [employee.employeeName, leaveType, startDate, endDate, reason],
          BOT
        );

        await sendSimpleButtons(
          message,
          listOfButtons(employeeId, ticketNo),
          recipientPhone
        );
      })
    );
  } else {
    await sendTextMessage('No Leave Requests Pending Approval', recipientPhone);
  }
}

async function handleActiveIssues({ recipientPhone, session }) {
  const { language, companyId } = session.get(recipientPhone).user;

  const issues = await Issue.findActive(companyId);

  if (issues && issues.length > 0) {
    await Promise.allSettled(
      issues.map(async (issue) => {
        const { employeeId, issueType, remark, ticketNumber } = issue;
        const employee = await Employee.findOne(
          { _id: employeeId, isActive: true },
          { employeeName: 1, employeeNumber: 1 }
        );

        const { message, listOfButtons } = getSimpleButtonsMessage(
          language,
          'sendIssue',
          [
            employee.employeeName,
            '-',
            issueType,
            remark,
            employee.employeeNumber,
            ticketNumber,
          ],
          BOT
        );

        await sendSimpleButtons(
          message,
          listOfButtons(employeeId, ticketNumber),
          recipientPhone
        );
      })
    );
  } else {
    sendTextMessage('No active issues found.', recipientPhone);
  }
}

async function handleUpdateIssue({ buttonId, session, recipientPhone }) {
  const { user } = session.get(recipientPhone);
  const [, status, docId] = buttonId.split('_');

  const res = await Issue.findByIdAndUpdate(
    docId,
    { status },
    { ticketNumber: 1 }
  );

  if (res) {
    const message = getTextMessage(
      user.language,
      'ticketUpdate',
      [res.ticketNumber],
      BOT
    );
    await sendTextMessage(message, recipientPhone);
  }
}

// async function handleLiveReport({ recipientPhone, session }) {
//   let { companyId, language, timeZone } = session.get(recipientPhone).user;
//   language = language.split('+')?.[1] ?? language;

//   const isLiveReport = await createLiveReport(
//     recipientPhone,
//     companyId,
//     language,
//     timeZone
//   );

//   if (isLiveReport) {
//     await sendDocument({
//       recipientPhone,
//       file_path: path.join(rootPath, `${recipientPhone}-liveReport.pdf`),
//       caption: 'Live Report',
//     });
//     await deleteFile(`${recipientPhone}-liveReport.pdf`);
//   } else {
//     await sendTextMessage('No data', recipientPhone);
//   }
// }

async function handleReport({ recipientPhone, buttonId, session }) {
  const { language } = session.get(recipientPhone).user;

  const { message, listOfButtons } = getSimpleButtonsMessage(
    language,
    buttonId,
    [],
    BOT
  );
  await sendSimpleButtons(message, listOfButtons, recipientPhone);
}

async function handleCurrentMonth({ recipientPhone, session }) {
  const { user } = session.get(recipientPhone);
  const language = user.language.split('+')?.[1] ?? user.language;

  // const isReportCreated = await createEmployeeReport(
  //   'current',
  //   user.employeeId,
  //   language
  // );

  // if (isReportCreated) {
  //   await sendDocument({
  //     file_path: path.join(rootPath, `${user.employeeId}-empReport.pdf`),
  //     caption: 'Current Month Report',
  //     recipientPhone,
  //   });

  //   await deleteFile(`${user.employeeId}-empReport.pdf`);
  // } else {
  //   await sendTextMessage('There is no data', recipientPhone);
  // }
}

async function handlePreviousMonth({ recipientPhone, session }) {
  const { user } = session.get(recipientPhone);
  const language = user.language.split('+')?.[1] ?? user.language;

  // const isReportCreated = await createEmployeeReport(
  //   'previous',
  //   user.employeeId,
  //   language
  // );

  // if (isReportCreated) {
  //   await sendDocument({
  //     file_path: path.join(rootPath, `${user.employeeId}-empReport.pdf`),
  //     caption: 'Previous Month Report',
  //     recipientPhone,
  //   });
  // } else {
  //   await sendTextMessage('There is no data', recipientPhone);
  // }

  // await deleteFile(`${user.employeeId}-empReport.pdf`);
}

async function handleEmpMasterSheet({ recipientPhone, session }) {
  let { companyId, language } = session.get(recipientPhone).user;
  language = language.split('+')?.[1] ?? language;
  // const isReport = await createAllEmployeeReport(
  //   recipientPhone,
  //   companyId,
  //   language
  // );

  // if (isReport) {
  //   await sendDocument({
  //     file_path: `${recipientPhone}-allEmployeeReport.pdf`,
  //     caption: 'All Employees Report',
  //     recipientPhone,
  //   });

  //   await fs.unlink(`${recipientPhone}-allEmployeeReport.pdf`);
  // } else {
  //   const message = getTextMessage(language, 'noEmployees', [], BOT);
  //   sendTextMessage(message, recipientPhone);
  // }
}

async function handleEmpDemo({ session, recipientPhone }) {
  const { language } = session.get(recipientPhone).user;

  const { message, listOfButtons } = getSimpleButtonsMessage(
    language,
    'employeeDemoStart',
    [],
    BOT
  );
  await sendSimpleButtons(message, listOfButtons, recipientPhone);
}

async function addEmployee({ buttonId, session, recipientPhone }) {
  const [, empName, empNumber] = buttonId.split('__@');
  const { companyId, companyName, language } = session.get(recipientPhone).user;

  let bufferTime = session.get(recipientPhone).user.bufferTime;

  if (!bufferTime) {
    const companyDetails = await Employer.findOne(
      {
        employerNumber: recipientPhone,
      },
      { bufferTime: 1 }
    );

    bufferTime = companyDetails?.bufferTime ?? 15;
    session.get(recipientPhone).user['bufferTime'] = bufferTime;
  }

  const nineHoursInMs = 12600000;

  const data = {
    employeeName: empName,
    employeeNumber: empNumber.split(' ').join('').replace('+', ''),
    companyId,
    companyName,
    employerNumber: recipientPhone,
    checkIn: new Date(...EPOCH, 9, 30),
    checkOut: new Date(...EPOCH, 18, 30),
    requiredHours: nineHoursInMs,
    bufferTime,
  };

  await Employee.create(data);

  const message = getTextMessage(language, 'employeeUploaded', [], BOT);

  await Whatsapp.sendImage({
    recipientPhone,
    caption: message,
    url: 'https://i.ibb.co/S6XxtXy/Hi-2.png',
  });

  await sendEmployeeDemoTemplate(
    `${companyName}`,
    empNumber.split(' ').join('')
  );
}

async function handleEditEmployee({ buttonId, recipientPhone, session }) {
  const [, employeeName, employeeNumber] = buttonId.split('__@');
  const { user } = session.get(recipientPhone);

  const employee = await Employee.findOne({
    employeeNumber,
    companyId: user.companyId,
    isActive: true,
  });

  let employees = await Employee.findEmployees(user.companyId);
  let { branch: locations } = await Employer.findBranch(
    recipientPhone,
    user.companyId
  );

  if (!employees || employees.length === 0) {
    employees = {
      employeeList1: [{ id: 'noEmployees', title: 'No Employees' }],
      employeeList2: [{ id: 'noEmployees', title: '' }],
      employeeList3: [{ id: 'noEmployees', title: '' }],
      employeeList4: [{ id: 'noEmployees', title: '' }],
    };
  } else if (employees.length > 0) {
    employees = createEmployeeProperties2(employees);
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

  const message = getTextMessage(user.language, 'editEmployee', [], BOT);

  const flowData = {
    screen: 'Edit_Employee',
    data: {
      ...message.label,
      init_values: {
        employeeName: employeeName,
        employeeNumber: employeeNumber,
        workinghours: '09:00',
        timing: 'flexible',
        checkin: '09:30',
        checkout: '18:30',
        branch: ['Any Location'],
      },
      departmentList: getDepartmentButtonList(user.deparments),
      all_extras: locations,
    },
  };

  if (employee) {
    const data = {
      employeeName: employee.employeeName,
      employeeNumber: employee.employeeNumber.toString(),
      checkin: convertTo24HourFormat(employee.checkIn),
      checkout: convertTo24HourFormat(employee.checkOut),
      workinghours: employee.workingHours,
      joiningDate: employee.joiningDate.day ?? '',
      dateOfBirth: employee.dateOfBirth ?? '',
      timing: employee.natureOfTime.toLocaleLowerCase(),
      branch: ['1'],
    };

    const branch = employee.locations.map(
      (location) =>
        location.name +
        '_@_' +
        location.lat +
        '_@_' +
        location.long +
        '_@_' +
        location.range
    );

    flowData.data.init_values = {
      ...data,
      branch: branch,
    };
  }

  await sendFlow({
    header: 'Edit Employee',
    body: message.body,
    flow_cta: 'Edit Employee',
    flow_token: EDIT_EMPLOYEE_FLOW_TOKEN,
    flow_id: EDIT_EMPLOYEE_FLOW_ID,
    flow_data: flowData,
    recipientPhone,
  });
}

function createEmployeeProperties2(employees) {
  const result = {
    employeeList1: [],
    employeeList2: [],
    employeeList3: [],
    employeeList4: [],
  };

  const checkboxes = employees.map((employee) => {
    return {
      id: `${employee.employeeNumber}`,
      title: createFormattedString2(
        employee.employeeName,
        employee.natureOfTime === 'flexible' ? 'Flexible' : 'Fixed',
        employee.locations?.[0]?.name
      ),
    };
  });

  const arrs = splitArray(checkboxes);

  arrs.forEach((arr, i) => {
    result[`employeeList${i + 1}`].push(...arr);
  });

  return result;
}

function createFormattedString2(userName, timingType, branch) {
  const nameAbbreviation = `${userName.split(' ')[0].slice(0, 5)}${userName.split(' ')[1]?.charAt(0) ?? ''
    }`;

  let formattedString = `${nameAbbreviation} (${timingType}) (${branch ?? 'Any'
    })`;

  if (formattedString.length > 30) {
    return formattedString.slice(0, 30);
  }

  return formattedString;
}

function splitArray(arrs) {
  const arrayLength = arrs.length;
  const chunkLength = 4;

  if (arrayLength >= chunkLength) {
    const result = [];
    const equalChunkLength = Math.floor(arrayLength / chunkLength);
    const leftOverLength = arrayLength % chunkLength;

    for (let i = 0; i < chunkLength; i++) {
      result.push(arrs.slice(i * equalChunkLength, (i + 1) * equalChunkLength));
    }

    if (leftOverLength > 0) {
      result[0].push(...arrs.slice(arrayLength - leftOverLength));
    }

    return result;
  } else {
    const chunkLeft = chunkLength - arrayLength;
    return [
      ...arrs.map((arr) => [{ ...arr }]),
      ...Array.from({ length: chunkLeft }, () => [{ id: 'null', title: '' }]),
    ];
  }
}

function convertTo24HourFormat(time) {
  return time.toLocaleTimeString('en-US', {
    timezone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getWorkingDaysInMonth(startDate, monthEnd, weekOffDays) {
  const workingDaysInMonth = [];

  const start = startDate.date();

  for (let date = start; date <= monthEnd.date(); date++) {
    if (!weekOffDays.includes(startDate.day())) {
      workingDaysInMonth.push([
        startDate.year(),
        startDate.month() + 1,
        startDate.date(),
      ]);
    }
    startDate.set('date', startDate.date() + 1);
  }

  return workingDaysInMonth;
}

function getWeekOffDays(workDaysInWeek) {
  const weekOffDays = [];

  for (let i = 0; i < 7; i++) {
    if (!workDaysInWeek.includes(i)) {
      weekOffDays.push(i);
    }
  }

  return weekOffDays;
}

export default handleSimpleButtonMessage;
