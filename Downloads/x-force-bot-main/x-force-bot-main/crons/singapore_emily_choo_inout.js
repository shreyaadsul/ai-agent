import mongoose from 'mongoose';
import dotenv from 'dotenv';
import moment from 'moment-timezone';
import fs from 'fs/promises';

dotenv.config({ path: '.env' });

// import Redis from '../lib/redis.js';
import { Employer, Attendance, Employee } from '../models/index.js';

import { delay } from '../utils/utils.js';

import { sendCheckInReminderTemplate } from '../utils/messages.js';

(async () => {
  const mongoUser = process.env.MONGO_USER;
  const mongoKey = process.env.MONGO_PASS;
  const mongoUrl = `mongodb+srv://${mongoUser}:${mongoKey}@apml.6w5pyjg.mongodb.net`;

  mongoose.connect(`${mongoUrl}/attendance_prod`, {}).then(async () => {
    sendCheckInReminders(0);
  });
})();

async function sendCheckInReminders(retries) {
  try {
    if (retries > 3) {
      console.log('Failed to send check-in reminder');
      return;
    }

    await delay(4000);

    const companyId = '66ffa27e7547c166b4611e0a';

    const employer = await Employer.findOne(
      {
        _id: companyId,
      },
      { timeZone: 1, employerNumber: 1 }
    );

    if (employer) {
      const employees = await Employee.find(
        {
          companyId: companyId,
        },
        { _id: 1, employeeName: 1, employeeNumber: 1 }
      );

      if (Array.isArray(employees)) {
        const day = moment.tz(new Date(), employer.timeZone);

        const currentDayStart = new Date(day.year(), day.month(), day.date());
        const currentDayEnd = new Date(
          day.year(),
          day.month(),
          day.date(),
          23,
          59,
          59
        );

        const attendances = await Attendance.find(
          {
            companyId: companyId,
            $and: [
              {
                date: { $gte: currentDayStart },
              },
              {
                date: { $lte: currentDayEnd },
              },
            ],
          },
          {
            employeeId: 1,
          }
        );

        for (const employee of employees) {
          const employeeAttendance = attendances.findIndex(
            (attendance) => attendance.employeeId === employee._id.toString()
          );

          if (employeeAttendance === -1) {
            await sendCheckInReminder(employee, 0);
          }
        }
      } else {
        retrySendingReminders(retries + 1);
      }
    } else {
      retrySendingReminders(retries + 1);
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

function retrySendingReminders(retries) {
  setTimeout(() => {
    sendCheckInReminders(retries);
  }, 8000 * retries);
}

async function sendCheckInReminder(employee, retries) {
  if (retries > 3) {
    console.log('Failed to send check-in reminder');
    return null;
  }

  const sentRes = await sendCheckInReminderTemplate(
    employee.employeeNumber,
    employee.employeeName
  );

  const messageStatus = sentRes.data?.messages?.[0]?.message_status;

  if (messageStatus === 'accepted') {
    await fs.appendFile(
      `${process.env.ROOT_PATH}/crons/check_in_reminder.csv`,
      `${new Date().toLocaleString().replace(',', '')}, ${
        employee.employeeNumber
      },${messageStatus}\n`
    );
  } else {
    await fs.appendFile(
      `${process.env.ROOT_PATH}/crons/check_in_reminder.csv`,
      `${new Date().toLocaleString().replace(',', '')}, ${
        employee.employeeNumber
      },${messageStatus}:failed\n`
    );
    sendCheckInReminder(employee, retries + 1);
  }
}
