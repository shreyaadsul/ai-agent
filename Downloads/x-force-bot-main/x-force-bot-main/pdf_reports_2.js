/* eslint-disable no-unused-vars */

import nunjucks from 'nunjucks';
import path from 'path';
import imageToBase64 from 'image-to-base64';
import moment from 'moment-timezone';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

import { Attendance, Leave, Employee } from './models/index.js';

import {
  getPrimaryLanguage,
  getTimeZoneAwareDate,
  getPreviousDayDate,
  convertTimeTo12HourFormat,
} from './utils/utils.js';
import { getTextMessage } from './utils/languages.js';
import {
  timeIn12H,
  formatTimeByTimezoneInHrMin,
  getTimeSpent,
  getFormatDate,
  getAllDates,
  getCurrentDayBounds,
  getTimeBounds,
  getDaysBetweenDates,
  formatTime,
} from './utils/time.js';

import { tryCatch } from './utils/tryCatch.js';

dotenv.config();

nunjucks.configure(`${process.env.ROOT_PATH}/templates`, {
  autoescape: true,
  noCache: true,
});

let mapImg, cameraImg, liveImg, calendarImg;

let browser;

(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    timeout: 30000,
  });

  mapImg = await imageToBase64(
    path.join(process.env.ROOT_PATH, '/public/map.png')
  );
  cameraImg = await imageToBase64(
    path.join(process.env.ROOT_PATH, '/public/camera.png')
  );
  liveImg = await imageToBase64(
    path.join(process.env.ROOT_PATH, '/public/live.png')
  );
  calendarImg = await imageToBase64(
    path.join(process.env.ROOT_PATH, '/public/calendar.png')
  );

  // createAllEmployeeReport(918657854260, '67c0661424b170898a73a0e3', 'English')

  // createHodAttendanceReport({
  //   timeZone: 'Asia/Kolkata',
  //   language: 'English',
  //   companyId: '657d6dc1c1ff796925ef089b',
  //   employeeId: '66bf29f6d8e5bfd79b526d1b',
  //   recipientPhone: 918657854260,
  //   companyName: 'GAURANG HONDA CHALISGAON',
  //   type: 'monthly_summary',
  //   startDate: '2025-03-11',
  //   endDate: '2025-03-12',
  //   department: [
  //     {
  //       id: '6752b683f79d406d2d0d99f8',
  //       name: 'CSN_SERVICE',
  //       head: {
  //         name: 'Mohsin Pathan',
  //         number: 917020121299,
  //         id: '66bf29f6d8e5bfd79b526d1b',
  //       },
  //     },
  //   ],
  // });

  // createEmployeeReport('current', {
  //   timeZone: 'Asia/Kolkata',
  //   language: 'English',
  //   companyId: '657d6dc1c1ff796925ef089b',
  //   employeeId: '66bf29f6d8e5bfd79b526d1b',
  //   recipientPhone: 918657854260,
  //   companyName: 'GAURANG HONDA CHALISGAON',
  // });

  // createAttendanceReport({
  //   timeZone: 'Asia/Kolkata',
  //   language: 'English',
  //   companyId: '66bf28cad8e5bfd79b526d17',
  //   recipientPhone: 918657854260,
  //   companyName: 'GAURANG HONDA CHALISGAON',
  //   type: 'monthly',
  //   startDate: '2025-05-01',
  //   endDate: '2025-05-31',
  // });
})();

export async function createAttendanceReport(data) {
  try {
    const {
      timeZone,
      language,
      companyId,
      recipientPhone,
      type,
      startDate,
      endDate,
    } = data;

    const primaryLanguage = getPrimaryLanguage(language);

    if (type === 'live') {
      var { start, end } = getCurrentDayBounds(timeZone);
    } else {
      // eslint-disable-next-line no-redeclare
      var { start, end } = getTimeBounds(timeZone, startDate, endDate);
    }

    let {
      status,
      message: errorMsg,
      employees,
      attendances,
      leaves,
    } = await fetchEmployeeAttendanceData(
      companyId,
      primaryLanguage,
      start,
      end
    );

    if (!status) {
      return {
        status,
        message: errorMsg,
      };
    }

    const mergedData = mergeEmployeeWithAttendanceAndLeaves(
      employees,
      attendances,
      leaves
    );

    const employeesCount = employees.length;

    employees = null;
    attendances = null;
    leaves = null;

    formatAttendances(mergedData);
    // filterDuplicateAttendances(mergedData);

    sortAttendances(mergedData);
    formatLeaves(mergedData);
    processAbsentAndDaysOff(mergedData, start, end);

    const summary = createAttendanceSummary(mergedData);

    const report = createReportData({
      ...data,
      companyId: data.companyId,
      startDate: start,
      endDate: end,
      language: primaryLanguage,
      employees: mergedData,
      summary,
      employeesCount,
      type,
      totalDays: getDaysBetweenDates(start, end, timeZone) + 1,
    });

    if (type === 'monthly_summary') {
      const dates = getAllDates(start, end);

      report.days = [];
      report.currentMonthDate = start.toLocaleDateString('en-GB', {
        month: 'short',
        year: '2-digit',
      });

      dates.forEach((date) => {
        report.days.push(date.date.date());
      });

      const html = await generateHTML(report, 'monthly_summary_report.html');

      await createPdf(
        html,
        `${recipientPhone}_attendance_report.pdf`,
        'A1',
        true
      );
    } else {
      const html = await generateHTML(report, 'attendance_report.html');

      await createPdf(html, `${recipientPhone}_attendance_report.pdf`);
    }

    const absentEmployees = [];

    mergedData.forEach((employee) => {
      for (const attendance of employee.attendances) {
        if (attendance.status === 'absent') {
          absentEmployees.push(employee.employeeName);
          break;
        }
      }
    });

    return {
      status: true,
      absentEmployees: absentEmployees,
      message: createAttendanceMessage(mergedData),
    };
  } catch (err) {
    console.error('Error creating attendance report:', err);
    return {
      status: false,
      message: 'Error creating attendance report',
    };
  }
}

export async function createHodAttendanceReport(data) {
  try {
    const {
      timeZone,
      language,
      department,
      recipientPhone,
      type,
      startDate,
      endDate,
    } = data;

    const primaryLanguage = getPrimaryLanguage(language);

    if (type === 'live') {
      var { start, end } = getCurrentDayBounds(timeZone);
    } else {
      // eslint-disable-next-line no-redeclare
      var { start, end } = getTimeBounds(timeZone, startDate, endDate);
    }

    const departmentHeadIds = department.map((d) => d.head.id);

    let employees = await Employee.find({
      'department.head.id': { $in: departmentHeadIds },
      isActive: true,
    }).select([
      'employeeName',
      'employeeNumber',
      'checkIn',
      'checkOut',
      'natureOfTime',
      'timeZone',
      'requiredHours',
      'workDays',
      'department',
    ]);

    if (!Array.isArray(employees) || employees.length === 0) {
      const message = getTextMessage(language, 'noEmployees');
      return {
        status: false,
        message,
      };
    }

    const employeeIds = employees.map((employee) => employee._id.toString());

    let attendances = await Attendance.find({
      employeeId: { $in: employeeIds },
      $and: [
        {
          date: { $gte: start },
        },
        {
          date: { $lte: end },
        },
      ],
    }).select(['-_id', '-companyId']);

    const mergedData = mergeEmployeeAttendanceDepartmentWise(
      data,
      employees,
      attendances
    );

    sortAttendances(mergedData);

    const report = createReportData({
      ...data,
      startDate: start,
      endDate: end,
      language: primaryLanguage,
      employees: mergedData,
      type,
      totalDays: getDaysBetweenDates(start, end, timeZone) + 1,
    });

    const html = await generateHTML(report, 'department_wise_report.html');

    await createPdf(html, `${recipientPhone}_attendance_report.pdf`);
    return { status: true };
  } catch (err) {
    console.error('Error creating attendance report:', err);
    return {
      status: false,
      message: 'Error creating attendance report',
    };
  }
}

export const createEmployeeReport = tryCatch(async (type, user) => {
  const date = new Date();

  let startDate = new Date(date.getFullYear(), date.getMonth(), 1);
  let endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  if (type === 'previous') {
    startDate = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    endDate = new Date(date.getFullYear(), date.getMonth(), 0);
  }

  const attendances = await Attendance.find(
    {
      employeeId: user.employeeId,
      $and: [{ date: { $gte: startDate } }, { date: { $lte: endDate } }],
    },
    {
      _id: 0,
      companyId: 0,
    }
  );

  const leaves = await Leave.find(
    {
      employeeId: user.employeeId,
      $and: [{ from: { $gte: startDate } }, { to: { $lte: endDate } }],
    },
    {
      _id: 0,
      companyId: 0,
      createdAt: 0,
      updatedAt: 0,
    }
  );

  const employee = await Employee.findOne(
    {
      _id: user.employeeId,
      isActive: true,
    },
    {
      employeeName: 1,
      employeeNumber: 1,
      _id: 1,
      checkIn: 1,
      checkOut: 1,
      timeZone: 1,
      requiredHours: 1,
    }
  );

  if (
    (attendances && attendances.length > 0) ||
    (leaves && leaves.length > 0)
  ) {
    const primaryLanguage = getPrimaryLanguage(user.language);
    const message = getTextMessage(primaryLanguage, 'live-report-templates');

    const reportObj = {
      ...message,
      mapImg,
      cameraImg,
    };

    reportObj.reportType = type;
    reportObj.leavesCount = leaves.length;

    const [att] = processAttendances(attendances, employee);
    const leave = processLeaves(leaves, employee);

    reportObj.attendances = att;
    reportObj.leaves = leave;

    reportObj.presentCount = attendances?.reduce((acc, cur) => {
      if (cur.checkInTime && cur.checkOutTime) return acc + 1;
    }, 0);

    if (type === 'previous') {
      reportObj.absentCount = 0;
    } else {
      reportObj.absentCount = 0;
    }

    const templateFilePath = `${process.env.ROOT_PATH}/templates/empReport.html`;
    const outputFileName = `${user.employeeId}-employeeReport.pdf`;
    const renderedTemplate = nunjucks.render(templateFilePath, reportObj);

    try {
      await createPdf(renderedTemplate, outputFileName);
      return true;
    } catch (err) {
      return false;
    }
  }

  return false;
});

export const createAllEmployeeReport = tryCatch(
  async (recipientPhone, companyId, language) => {
    const employees = await Employee.findEmployees(companyId);

    if (Array.isArray(employees) && employees.length > 0) {
      const primaryLanguage = getPrimaryLanguage(language);

      const message = getTextMessage(
        primaryLanguage,
        'all-emp-report-templates',
        [],
        'main'
      );

      const reportObj = {
        employees: [],
        employeesCount: employees.length,
        companyName: employees[0].companyName,
        ...message,
      };

      employees.forEach((employee) => {
        const checkIn = getTimeZoneAwareDate(
          employee.timeZone,
          employee.checkIn
        )[1];
        const checkOut = getTimeZoneAwareDate(
          employee.timeZone,
          employee.checkOut
        )[1];

        reportObj.employees.push({
          checkIn,
          checkOut,
          companyName: employee?.companyName ?? '-',
          employeeName: employee.employeeName,
          employeePhone: employee.employeeNumber,
          designation: employee?.designation ?? '-',
          // department: employee?.department ?? '-',
          department: '-',
          joiningDate: new Date(employee.joiningDate)?.toDateString() || '-',
          language: employee?.language ?? '-',
          natureOfTime: employee?.natureOfTime ?? '-',
          countryName: employee?.countryName ?? '-',
          timeZone: employee?.timeZone ?? '-',
          locations: employee?.locations ?? '-',
          workDays:
            employee?.workDays?.sort(function (a, b) {
              return a - b;
            }) ?? '-',
          shiftType: employee?.shiftType ?? '-',
          location: employee.proof.location,
          logs: employee.proof.logs,
          image: employee.proof.image,
        });
      });

      const templateFilePath = `${process.env.ROOT_PATH}/templates/allEmployeeReport.html`;
      const outputFileName = `${recipientPhone}-allEmployeeReport.pdf`;

      const renderedTemplate = nunjucks.render(templateFilePath, reportObj);

      try {
        await createPdf(renderedTemplate, outputFileName);
        return { status: true };
      } catch (err) {
        const message = getTextMessage(language, 'errorInReport');
        return { status: false, message };
      }
    }

    const message = getTextMessage(language, 'noEmployees');

    return {
      status: false,
      message,
    };
  }
);

export async function createdailySOP(
  recipientPhone,
  flowMessage,
  employeedetails,
  employerself
) {
  const reportObj = {
    data: flowMessage,
    employeedetails: employeedetails,
    employerself: employerself,
  };

  const templateFilePath = `${process.env.ROOT_PATH}/templates/createdailysop.html`;
  const outputFileName = `${recipientPhone}-createdailysop.pdf`;

  const renderedTemplate = nunjucks.render(templateFilePath, reportObj);

  return await createPdf(renderedTemplate, outputFileName);
}

function mergeEmployeeWithAttendanceAndLeaves(employees, attendances, leaves) {
  const mergedData = [];

  employees.forEach((employee) => {
    const employeeId = employee._id.toString();

    // if (employeeId === '65c7449f23a11b003d55770b') {
    const employeeAttendance = attendances.filter(
      (attendance) => employeeId === attendance.employeeId
    );

    const employeeLeave = leaves.filter(
      (leave) => employeeId === leave.employeeId
    );

    const formatTime12H = timeIn12H(employee.timeZone);

    mergedData.push({
      employeeId: employee._id.toString(),
      employeeName: employee.employeeName,
      employeeNumber: employee.employeeNumber,
      natureOfTime: employee.natureOfTime,
      timeZone: employee.timeZone,
      fixedInTime: formatTime12H(employee.checkIn),
      fixedOutTime: formatTime12H(employee.checkOut),
      requiredHours: formatTimeByTimezoneInHrMin(
        employee.timeZone,
        employee.requiredHours
      ),
      workDays: employee.workDays,
      attendances: employeeAttendance,
      leaves: employeeLeave,
    });
    // }
  });

  return mergedData;
}

function mergeEmployeeAttendanceDepartmentWise(hod, employees, attendances) {
  const mergedData = [];

  hod.department.forEach((department) => {
    const departmentEmployees = employees.filter((employee) =>
      employee.department.some((dept) => dept.id === department.id)
    );

    const departmentAttendances = [];

    departmentEmployees.forEach((employee) => {
      const formatTime12H = timeIn12H(employee.timeZone);

      const employeeAttendance = attendances.filter(
        (attendance) => employee._id.toString() === attendance.employeeId
      );

      employeeAttendance.forEach((att) =>
        departmentAttendances.push({
          employeeId: employee._id.toString(),
          employeeName: employee.employeeName,
          employeeNumber: employee.employeeNumber,
          natureOfTime: employee.natureOfTime,
          timeZone: employee.timeZone,
          fixedInTime: formatTime12H(employee.checkIn),
          fixedOutTime: formatTime12H(employee.checkOut),
          requiredHours: formatTimeByTimezoneInHrMin(
            employee.timeZone,
            employee.requiredHours
          ),
          workDays: employee.workDays,
          ...formatAttendance(att, employee),
        })
      );
    });

    mergedData.push({
      departmentId: department.id,
      departmentName: department.name,
      departmentHead: department.head,
      attendances: departmentAttendances,
    });
  });

  return mergedData;
}

async function fetchEmployeeAttendanceData(
  companyId,
  language,
  startDate,
  endDate
) {
  try {
    let employees = await Employee.find({
      companyId,
      isActive: true,
    }).select([
      'employeeName',
      'employeeNumber',
      'checkIn',
      'checkOut',
      'natureOfTime',
      'timeZone',
      'requiredHours',
      'workDays',
      'department',
    ]);

    if (!Array.isArray(employees) || employees.length === 0) {
      const message = getTextMessage(language, 'noEmployees');
      return {
        status: false,
        message,
      };
    }

    let attendances = await Attendance.find({
      companyId,
      $and: [
        {
          date: { $gte: startDate },
        },
        {
          date: { $lte: endDate },
        },
      ],
    }).select(['-_id', '-companyId']);

    // if (!Array.isArray(attendances) || attendances.length === 0) {
    //   const message = 'No Employees has marked attendance *Today*';
    //   return {
    //     status: false,
    //     message,
    //   };
    // }

    const leaves = await Leave.find({
      companyId,
      from: {
        $gte: startDate,
      },
      $or: [{ status: 'open' }, { status: 'hold' }],
    }).select(['-_id', '-companyId', '-createdAt', '-updatedAt']);

    return {
      status: true,
      employees,
      attendances,
      leaves,
    };
  } catch (error) {
    console.error('Error fetching employee attendance data:', error);

    return {
      status: false,
      message: 'An error occurred while processing the request.',
    };
  }
}

function formatAttendances(employees) {
  for (let i = 0; i < employees.length; i++) {
    const employee = employees[i];

    for (let j = 0; j < employee.attendances.length; j++) {
      const attendance = employee.attendances[j];

      employees[i].attendances[j] = formatAttendance(attendance, employee);
    }
  }
}

function formatAttendance(attendance, employee) {
  const formatTime12H = timeIn12H(employee.timeZone);

  return {
    checkInTime: formatTime12H(attendance.checkInTime),
    checkOutTime: attendance.checkOutTime
      ? formatTime12H(attendance.checkOutTime)
      : '-',
    actualTime: attendance.timeSpent
      ? attendance.timeSpent
      : getTimeSpent(attendance.checkInTime, employee.timeZone),
    status: attendance.status,
    checkInDate: getFormatDate(employee.timeZone, attendance.date),
    date: moment.tz(attendance.date, employee.timeZone),
    checkInCoords: encodeURIComponent(
      `${attendance.checkInCoords[0]},${attendance.checkInCoords[1]}`
    ),
    checkOutCoords:
      attendance.checkOutCoords.length > 0
        ? encodeURIComponent(
            `${attendance.checkOutCoords?.[0]},${attendance.checkOutCoords?.[1]}`
          )
        : '-',
    checkInPic: attendance.checkInPic,
    checkOutPic: attendance.checkOutPic ? attendance.checkOutPic : '-',
    shift: attendance.shift,
  };
}

function sortAttendances(employees) {
  for (let i = 0; i < employees.length; i++) {
    const employee = employees[i];

    employees[i].attendances = employee.attendances.sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
  }
}

function processAbsentAndDaysOff(employees, startDate, endDate) {
  // ? array of dates in ascending order from start to end
  const dates = getAllDates(startDate, endDate);

  for (let j = 0; j < employees.length; j++) {
    const employee = employees[j];
    const attendances = employee.attendances;

    for (let i = 0; i < dates.length; i++) {
      const formattedDate = dates[i].formattedDate;
      const attendanceDate = attendances[i]?.date.format('YYYY-MM-DD');

      if (!attendanceDate || attendanceDate !== formattedDate) {
        const data = {
          date: dates[i].date,
          checkInTime: '-',
          checkOutTime: '-',
          actualTime: '-',
          status: 'absent',
          checkInDate: getFormatDate(employee.timeZone, dates[i].date),
          checkInPic: '-',
          checkOutPic: '-',
        };

        const isWeekOff = employee.workDays.includes(dates[i].date.day());

        if (!isWeekOff) {
          data.status = 'week-off';
        }

        employees[j].attendances.splice(i, 0, data);
      }
    }
  }
}

function processAbsentAndDaysOffHodWise(departments, startDate, endDate) {
  // ? array of dates in ascending order from start to end
  const dates = getAllDates(startDate, endDate);

  for (let j = 0; j < departments.length; j++) {
    const department = departments[j];
    const attendances = department.attendances;

    for (let i = 0; i < dates.length; i++) {
      const formattedDate = dates[i].formattedDate;
      const attendanceDate = attendances[i]?.date.format('YYYY-MM-DD');

      if (!attendanceDate || attendanceDate !== formattedDate) {
        const data = {
          date: dates[i].date,
          checkInTime: '-',
          checkOutTime: '-',
          actualTime: '-',
          status: 'absent',
          checkInDate: getFormatDate(attendances[i].timeZone, dates[i].date),
          checkInPic: '-',
          checkOutPic: '-',
        };

        const isWeekOff = attendances[i].workDays.includes(dates[i].date.day());

        if (!isWeekOff) {
          data.status = 'week-off';
        }

        departments[j].attendances.splice(i, 0, data);
      }
    }
  }
}

function findMissingAttendanceDates(presentDates, dates) {
  const missingDates = dates.filter(
    (date) => !presentDates.includes(date.format('YYYY-MM-DD'))
  );

  return missingDates;
}

function formatLeaves(employees) {
  for (let i = 0; i < employees.length; i++) {
    const employee = employees[i];

    for (let j = 0; j < employee.leaves.length; j++) {
      const leave = employee.leaves[j];

      employees[i].leaves[j] = {
        leaveType: leave.leaveType,
        from: moment(leave.from),
        to: leave.to ? moment(leave.to) : '-',
        ticketNo: leave.ticketNo,
        status: leave.status,
        reason: leave.reason,
      };
    }
  }
}

function createReportData(data) {
  const message = getTextMessage(
    data.language,
    'live-report-templates',
    [],
    'main'
  );

  const report = {
    employeesCount: data.employeesCount,
    companyName: data.companyName,
    ...message,
    companyId: data.companyId,
    employees: data.employees,
    type: data.type,
    mapImg,
    employeeWiseSummary: data.summary?.employeeWiseSummary ?? [],
    summaries: data.summary?.fullSummary ?? {},
    cameraImg,
    calendarImg,
    totalDays: data.totalDays,
    time: 'Date',
    name: 'Name',
  };

  switch (data.type) {
    case 'live':
      report.startDate = getFormatDate(data.timeZone, data.startDate);
      break;
    default:
      report.startDate = getFormatDate(data.timeZone, data.startDate);
      report.endDate = getFormatDate(data.timeZone, data.endDate);
      break;
  }

  return report;
}

function createAttendanceSummary(employees) {
  const summary = {
    fullSummary: {
      onTime: 0,
      'half-day': 0,
      'full-day': 0,
      late: 0,
      absent: 0,
    },
    employeeWiseSummary: [],
  };

  employees.forEach((employee) => {
    const employeeWiseSummary = {
      onTime: 0,
      'half-day': 0,
      'full-day': 0,
      'week-off': 0,
      late: 0,
      absent: 0,
      employeeName: employee.employeeName,
      employeeNumber: employee.employeeNumber,
    };

    employee.attendances.forEach((attendance) => {
      employeeWiseSummary[attendance.status]++;
      summary.fullSummary[attendance.status]++;
    });

    summary.employeeWiseSummary.push(employeeWiseSummary);
  });

  return summary;
}

async function createPdf(html, fileName, format = 'A3', landscape = false) {
  if (!browser?.connected) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
      timeout: 30000,
    });
  }

  const page = await browser.newPage();

  await page.setContent(html);

  const pdfOptions = {
    path: `${process.env.ROOT_PATH}/${fileName}`,
    format,
    printBackground: true,
    landscape,
    margin: {
      top: '1cm',
    },
  };

  await page.pdf(pdfOptions);

  await page.close();
}

async function generateHTML(data, template) {
  const templateFilePath = `${process.env.ROOT_PATH}/templates/${template}`;

  return nunjucks.render(templateFilePath, data);
}

function filterDuplicateAttendances(employees) {
  for (let i = 0; i < employees.length; i++) {
    const uniqueDates = new Set();
    const employee = employees[i];

    const uniqueAttendances = employee.attendances.filter((attendance) => {
      const dateOnly = attendance.date.format('YYYY-MM-DD');

      if (uniqueDates.has(dateOnly)) {
        return false;
      } else {
        uniqueDates.add(dateOnly);
        return true;
      }
    });

    employees[i].attendances = uniqueAttendances;
  }
}

function createAbsentEmployeesMessage(employees) {
  let message = '';

  employees.forEach((emp) =>
    emp.attendances.map((att) => {
      if (att.status === 'absent') {
        message += `${emp.employeeName}\n`;
      }
    })
  );

  return message.slice(0, message.length - 1);
}

function createAttendanceMessage(employees) {
  let message = '';

  employees.forEach((emp) =>
    emp.attendances.forEach((att) => {
      if (att.status !== 'absent')
        message += `${emp.employeeName}\nIn: ${att.checkInTime} ${
          att.checkOutTime !== '-' ? `- Out: ${att.checkOutTime}` : ''
        }\n`;
    })
  );

  return message;
}

function processAttendances(attendances, employee) {
  let onTime = 0;
  let late = 0;
  let halfDay = 0;
  let fullDay = 0;

  const { employeeName, employeeNumber, checkIn, checkOut, timeZone } =
    employee;
  const presentEmployeeIds = new Set();
  const employeeId = employee._id.toString();

  const formattedAttendances = [];
  const logs = [];

  attendances.forEach((attendance) => {
    if (attendance.employeeId === employeeId) {
      presentEmployeeIds.add(employeeId);

      if (attendance.logs && attendance.logs.length > 0) {
        logs.push({
          employeeName,
          employeeNumber,
          logs: attendance.logs.map((log) => ({
            time:
              moment.tz(new Date(log.time), timeZone).format('DD/MM/YY') +
              ' ' +
              convertTimeTo12HourFormat(
                moment.tz(new Date(log.time), timeZone)
              ),
            logs: log.log,
            type: log.logType,
          })),
        });
      }

      if (attendance.status === 'onTime') onTime += 1;
      else if (attendance.status === 'half-day') halfDay += 1;
      else if (attendance.status === 'full-day') fullDay += 1;
      else if (attendance.status === 'late') late += 1;

      formattedAttendances.push({
        employeeId,
        employeeName,
        employeeNumber,
        checkInTime: convertTimeTo12HourFormat(
          moment.tz(new Date(attendance.checkInTime), timeZone)
        ),
        checkOutTime: attendance.checkOutTime
          ? convertTimeTo12HourFormat(
              moment.tz(new Date(attendance.checkOutTime), timeZone)
            )
          : '-',
        actualTime: attendance.timeSpent
          ? attendance.timeSpent
          : getTimeSpent(attendance.checkInTime, timeZone),
        fixedInTime: getTimeZoneAwareDate(timeZone, checkIn)[1],
        fixedOutTime: getTimeZoneAwareDate(timeZone, checkOut)[1],
        requiredHours: formatTime(new Date(employee.requiredHours)),
        status: attendance.status,
        checkInDate: getFormatDate(timeZone, attendance.date),
        date: attendance.date,
        checkInCoords: encodeURIComponent(
          `${attendance.checkInCoords[0]},${attendance.checkInCoords[1]}`
        ),
        checkOutCoords:
          attendance.checkOutCoords.length > 0
            ? encodeURIComponent(
                `${attendance.checkOutCoords?.[0]},${attendance.checkOutCoords?.[1]}`
              )
            : '-',
        checkInPic: attendance.checkInPic,
        checkOutPic: attendance.checkOutPic ? attendance.checkOutPic : '-',
      });
    }
  });

  return [
    formattedAttendances,
    { onTime, late, halfDay, fullDay },
    [...presentEmployeeIds],
    logs,
  ];
}

function processLeaves(leaves, employee) {
  const { employeeName, employeeNumber } = employee;
  const employeeId = employee._id.toString();

  const formattedleave = [];

  leaves.forEach((leave) => {
    if (leave.employeeId === employeeId) {
      formattedleave.push({
        employeeName,
        employeeNumber,
        leaveType: leave.leaveType,
        startDate: getTimeZoneAwareDate('Asia/Kolkata', leave.from)[0],
        endDate: leave.to
          ? getTimeZoneAwareDate('Asia/Kolkata', leave.to)[0]
          : 'Invalid Date',
        status: leave.status,
        reason: leave.reason ?? '',
      });
    }
  });

  return formattedleave;
}
