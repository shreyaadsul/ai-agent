import cron from "node-cron";
import mongoose from "mongoose";
import moment from "moment-timezone";
import session from "./lib/session.js";

// import { sendMail } from "../utils/logger.js";
import { sendMail } from "./utils/logger.js";

import { Employer, Employee, Attendance } from "./models/index.js";

import { sendActivateSessionTemplate, sendDocument, sendTextMessage } from "./utils/messages.js";
import { delay } from "./utils/utils.js";

import { createLiveReport, createLiveReportWithData } from "./reports.js";

// --- AUTOMATED CHECK-IN PROMPTS ---
cron.schedule("*/5 * * * *", async () => {
  console.log(`[CRON] ⏰ Running Check-in Prompt Service...`);

  try {
    // Get all active employees
    const employees = await Employee.find({ isActive: true });

    for (const emp of employees) {
      if (!emp.workSchedule?.startTime || !emp.workSchedule?.timezone) continue;

      const tz = emp.workSchedule.timezone;
      const now = moment().tz(tz);
      const currentTimeStr = now.format("HH:mm"); // 09:00

      // Check if shift starts NOW (+/- 5 mins)
      if (emp.workSchedule.startTime === currentTimeStr) {

        // Verify if already checked in today
        const todayStart = now.clone().startOf('day').toDate();
        const todayEnd = now.clone().endOf('day').toDate();

        const existingAttendance = await Attendance.findOne({
          employeeId: emp._id.toString(),
          date: { $gte: todayStart, $lte: todayEnd }
        });

        if (!existingAttendance) {
          console.log(`[CRON] 🚀 Prompting ${emp.employeeName} (${emp.employeeNumber}) for Check-in`);

          await sendTextMessage(
            `Good morning ${emp.employeeName}! 🌞\nIt's ${currentTimeStr}. Please share your *Location* to Check In.`,
            emp.employeeNumber
          );

          // Set Session
          session.set(emp.employeeNumber, {
            session: 'awaiting_checkin_location',
            user: emp,
            lastInteraction: Date.now()
          });
        }
      }
    }
  } catch (error) {
    console.error(`[CRON ERROR] Check-in prompts failed: ${error.message}`);
  }
});

(async () => {
  const mongoUser = process.env.MONGO_USER;
  const mongoKey = process.env.MONGO_PASS;
  const mongoUrl = `mongodb+srv://${mongoUser}:${mongoKey}@apml.6w5pyjg.mongodb.net`;

  mongoose.connect(`${mongoUrl}/attendance_prod`, {}).then(async () => {
    console.log("Connected to MongoDB");
  });
})();

cron.schedule("0 20 * * *", async () => {
  await sendReport();
});

cron.schedule("0 11 * * *", async () => {
  await sendReport();
});

cron.schedule("0 19 * * *", async () => {
  const employers = await Employer.find(
    { isActive: true },
    { employerNumber: 1, _id: 1, timeZone: 1, language: 1, fullName: 1 }
  );

  for (const employer of employers) {
    await delay(300);
    await sendActivateSessionTemplate(employer.employerNumber);
  }

  await sendMail(
    "Activate Session",
    employers
      .map(
        (employer) =>
          `employer: ${employer.employerNumber}\nname: ${employer.fullName}`
      )
      .join("\n")
  );
});

async function sendReport() {
  const employers = await Employer.find(
    { isActive: true },
    { _id: 1, employerNumber: 1, timeZone: 1, language: 1, companyId: 1 }
  );

  if (!Array.isArray(employers) || employers.length === 0) return;

  const subject = "Send Reports";
  let body = "";

  for (const employer of employers) {
    await delay(400);
    let message = "Live Report";

    const { employerNumber, timeZone, _id, language, companyId } = employer;

    const absentNames = [];

    let isReport = {};

    if (
      _id?.toString() === process.env.HONDA_COMPANY_ID ||
      companyId === process.env.HONDA_COMPANY_ID
    ) {
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

      const attendances = await Attendance.find(
        {
          $or: [{ companyId: _id?.toString() }, { companyId }],
          date: {
            $gte: currentDayStart,
            $lt: currentDayEnd,
          },
        },
        {
          _id: 0,
          companyId: 0,
        }
      );

      const employees = await Employee.find(
        {
          $or: [{ companyId: _id?.toString() }, { companyId }],
          isActive: true,
        },
        {
          _id: 1,
          employeeName: 1,
          employeeNumber: 1,
          checkIn: 1,
          checkOut: 1,
          natureOfTime: 1,
          timeZone: 1,
          requiredHours: 1,
          companyName: 1,
        }
      );

      if (Array.isArray(attendances) && attendances.length > 0) {
        if (Array.isArray(employees) && employees.length > 0) {
          employees.forEach((employee) => {
            const present = attendances.findIndex(
              (attendance) => attendance.employeeId === employee._id.toString()
            );

            if (present === -1) {
              absentNames.push(employee.employeeName);
            }
          });

          if (absentNames.length > 0) {
            message += `\n\n*Employees Absent Today*\n\n${absentNames.join(
              ",\n"
            )}`;
          } else {
            message = `\n\n*No Employees Found*`;
          }
        } else {
        }
      } else {
        // message += `\n\n*No Employees has Marked
        if (Array.isArray(employees) && employees.length > 0) {
          message = "\n\n*Employees Absent Today*\n\n";

          employees.forEach((employee) => {
            // absentNames.push(employee.employeeName);
            message += `${employee.employeeName}\n`;
          });
        } else {
          message = `*No Employees Found*`;
        }
      }

      isReport = await createLiveReportWithData(
        employerNumber,
        attendances,
        employees,
        {
          companyId: _id,
          language,
          timeZone,
        }
      );
    } else {
      isReport = await createLiveReport(employerNumber, {
        companyId: _id,
        language,
        timeZone,
      });
    }

    if (isReport && isReport.status) {
      const res = await sendDocument({
        caption: message,
        recipientPhone: employerNumber,
        file_path: `${employerNumber}-liveReport.pdf`,
      });

      body += `status: ${res?.response?.status
        }, number: ${employerNumber} document: ${JSON.stringify(
          res?.body?.document
        )}`;
    }
  }

  await sendMail(subject, body);
}
