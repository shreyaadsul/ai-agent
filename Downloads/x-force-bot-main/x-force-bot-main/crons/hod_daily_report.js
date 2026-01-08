import mongoose from 'mongoose';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

import { Employee } from '../models/index.js';
// import { createLiveBranchReport } from '../reports.js';
import { sendDocument } from '../utils/messages.js';
import { delay } from '../utils/utils.js';
import { createHodAttendanceReport } from '../pdf_reports_2.js';

(async () => {
  const mongoUser = process.env.MONGO_USER;
  const mongoKey = process.env.MONGO_PASS;
  const mongoUrl = `mongodb+srv://${mongoUser}:${mongoKey}@apml.6w5pyjg.mongodb.net`;

  await delay(1000);

  mongoose.connect(`${mongoUrl}/attendance_prod`, {}).then(async () => {
    console.log('Connected to MongoDB');
    await sendReport();
    delay(5000);
    process.exit(0);
  });
})();

async function sendReport() {
  await delay(5000);

  const hods = await Employee.find(
    { isActive: true, role: 'hod' },
    { employeeNumber: 1, language: 1, timeZone: 1, department: 1, companyId: 1 }
  );

  for (const hod of hods) {
    await delay(1000);

    const isReport = await createHodAttendanceReport(hod.employeeNumber, {
      department: hod.department,
      language: hod.language,
      timeZone: hod.timeZone,
    });

    if (isReport && isReport.status) {
      try {
        var res = await sendDocument({
          caption: 'Hod Live Report',
          recipientPhone: hod.employeeNumber,
          // recipientPhone: 918657854260,
          file_path: `${hod.employeeNumber}-branchLiveReport.pdf`,
        });

        const messageStatus = res.data?.messages?.[0]?.message_status;

        if (messageStatus === 'accepted') {
          fs.appendFile(
            './hod_report.csv',
            `${new Date().toLocaleString().replace(',', '')}, ${
              hod.employeeNumber
            }, ${messageStatus}\n`
          );
        } else {
          fs.appendFile(
            './hod_report.csv',
            `${new Date().toLocaleString().replace(',', '')}, ${
              hod.employeeNumber
            }, ${messageStatus}:failed\n`
          );
        }
      } catch (e) {
        console.error(e);
      }
    }
  }
}
