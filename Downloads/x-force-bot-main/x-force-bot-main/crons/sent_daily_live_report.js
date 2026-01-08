import mongoose from 'mongoose';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

import { Employer } from '../models/index.js';
import { sendActivateSessionTemplateWithReport } from '../utils/messages.js';
import { delay, uploadMedia } from '../utils/utils.js';
import { createAttendanceReport } from '../pdf_reports_2.js';

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

  const employers = await Employer.find(
    { isActive: true },
    {
      _id: 1,
      employerNumber: 1,
      timeZone: 1,
      language: 1,
      companyId: 1,
      companyName: 1,
    }
  );

  if (!Array.isArray(employers) || employers.length === 0) return;

  for (const employer of employers) {
    await delay(1000);

    if (employer._id.toString() === '66ffa27e7547c166b4611e0a') continue;

    const employerNumber = employer.employerNumber;

    try {
      var report = await createAttendanceReport({
        ...employer._doc,
        companyName: employer.companyName,
        recipientPhone: employerNumber,
        companyId: employer.companyId ?? employer._id.toString(),
        type: 'live',
      });
    } catch (err) {
      console.error('create daily report pdf error', err);
      continue;
    }

    if (report && report.status) {
      try {
        var mediaId = await uploadMedia(
          `${employerNumber}_attendance_report.pdf`
        );
      } catch (err) {
        console.error('daily report pdf upload error', err);
        continue;
      }

      if (mediaId) {
        try {
          var res = await sendActivateSessionTemplateWithReport(
            'Live Report',
            employerNumber,
            report.absentEmployees,
            mediaId,
            'Live Report.pdf'
          );
        } catch (err) {
          console.error('daily report pdf upload error', err.response.data);
          continue;
        }
        
        try {
          // await sendActivateSessionTemplateWithReport(
          //   'Live Report',
          //   918657854260,
          //   report.absentEmployees,
          //   mediaId,
          //   'Live Report.pdf'
          // );
        } catch (err) {
          console.error('daily report pdf upload error', err.response.data);
          continue;
        }

        const messageStatus = res?.data?.messages?.[0]?.message_status;

        if (messageStatus === 'accepted') {
          await fs.appendFile(
            `${process.env.ROOT_PATH}/crons/live_report.csv`,
            `${new Date()
              .toLocaleString()
              .replace(',', '')}, ${employerNumber}, ${messageStatus}\n`
          );
        }
      }
    }
  }
}
