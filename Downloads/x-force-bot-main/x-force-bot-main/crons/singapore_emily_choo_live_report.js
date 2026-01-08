import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config({ path: '.env' });

import { Employer } from '../models/index.js';
import { delay, uploadMedia } from '../utils/utils.js';
// import { createLiveReportWithReportMessage } from '../reports.js';
import { sendActivateSessionTemplateWithReport } from '../utils/messages.js';
import { createAttendanceReport } from '../pdf_reports_2.js';

(async () => {
  const mongoUser = process.env.MONGO_USER;
  const mongoKey = process.env.MONGO_PASS;
  const mongoUrl = `mongodb+srv://${mongoUser}:${mongoKey}@apml.6w5pyjg.mongodb.net`;

  await delay(1000);

  mongoose.connect(`${mongoUrl}/attendance_prod`, {}).then(async () => {
    console.log('Mongodb connection established');
    await sendActivateSessionWithLiveReportToEmilyChoo(0);
    await delay(5000);
    process.exit(1);
  });
})();

async function sendActivateSessionWithLiveReportToEmilyChoo() {
  await delay(5000);

  try {
    const employer = await Employer.findOne({
      _id: '66ffa27e7547c166b4611e0a',
    });

    const employerNumber = employer.employerNumber;

    const report = await createAttendanceReport({
      ...employer._doc,
      companyName: employer.companyName,
      recipientPhone: employerNumber,
      companyId: employer._id,
      type: 'live',
    });

    if (report && report.status) {
      const mediaId = await uploadMedia(
        `${employerNumber}_attendance_report.pdf`
      );

      if (mediaId) {
        const res = await sendActivateSessionTemplateWithReport(
          'Live Report',
          employerNumber,
          report.absentEmployees,
          mediaId,
          'Live Report.pdf'
        );

        const response = await sendActivateSessionTemplateWithReport(
          'Live Report',
          918657854260,
          report.absentEmployees,
          mediaId,
          'Live Report.pdf'
        );

        const messageStatus = res?.data?.messages?.[0]?.message_status;

        if (messageStatus === 'accepted') {
          await fs.appendFile(
            `${process.env.ROOT_PATH}/crons/live_report.csv`,
            `${new Date()
              .toLocaleString()
              .replace(',', '')}, ${employerNumber}, ${messageStatus}\n`
          );
        }

        // await sendActivateSessionTemplateWithReport(
        //   `Emily Choo live report ${report.reportMessage.slice(0, 960)}`,
        //   '918657854260',
        //   mediaId,
        //   'Live Report.pdf'
        // );

        // if (res && res.status === 200 && res.data) {
        //   await Redis.hset(
        //     `${employerNumber}:notification`,
        //     {
        //       type: 'activate_session_with_daily_live_report',
        //       mediaId,
        //       try: '1',
        //     },
        //     DAY_IN_SECS
        //   );
        // } else {
        //   retrySendingTemplate();

        //   await sendMail(
        //     `Error: Emily Choo (singapore)", "Error sending live report\n\nreport data: ${JSON.stringify(
        //       report ?? '{}'
        //     )}\n\nwhatsapp response: ${JSON.stringify(res.data)}`
        //   );
        // }
      } else {
        // retrySendingTemplate();
        // await sendMail(
        //   `Error: Emily Choo (singapore)", "Error sending live report\n\nFailed to upload media`
        // );
      }
    } else {
      // retrySendingTemplate();
      // await sendMail(
      //   `Error: Emily Choo (singapore)", "Error sending live report\n\nreport data: ${JSON.stringify(
      //     report ?? '{}'
      //   )}`
      // );
    }
  } catch (err) {
    console.error(err?.response?.data);
  }
}

// eslint-disable-next-line no-inner-declarations
// function retrySendingTemplate(retry) {
//   if (retry < 4) {
//     setTimeout(
//       () => sendActivateSessionWithLiveReportToEmilyChoo(retry + 1),
//       8000 * retry
//     );
//   }
// }
