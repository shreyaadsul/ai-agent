import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config({ path: '.env' });

import { sendActivateSessionTemplate } from '../utils/messages.js';
import { Employer } from '../models/index.js';
import { delay } from '../utils/utils.js';
import { sendMail } from '../utils/logger.js';
// import Redis from '../lib/redis.js';

(async () => {
  const mongoUser = process.env.MONGO_USER;
  const mongoKey = process.env.MONGO_PASS;
  const mongoUrl = `mongodb+srv://${mongoUser}:${mongoKey}@apml.6w5pyjg.mongodb.net`;

  mongoose
    .connect(`${mongoUrl}/attendance_prod`, {})
    .then(async () => {
      sendActivateSessions(0);
    })
    .catch(() => {
      sendMail('Error: Activate Session: Database Connection Failed');
    });
})();

async function sendActivateSessions() {
  try {
    const employers = await Employer.find(
      { isActive: true },
      { employerNumber: 1 }
    );

    if (Array.isArray(employers)) {
      for (const employer of employers) {
        await delay(2000);

        if (employer._id.toString() === '66ffa27e7547c166b4611e0a') continue;

        const resp = await sendActivateSessionTemplate(employer.employerNumber);
        
        if (resp && resp.status === 200 && resp.data) {
          await fs.appendFile(
            './activate_session.csv',
            `${new Date().toLocaleString().replace(',', '')}, ${
              employer.employerNumber
            },${resp.data.messages[0].message_status}\n`
          );

          // await Redis.hset(`${employer.employerNumber}:notification`, {
          //   type: 'activate_session',
          //   try: '1',
          // });
        } else {
          await fs.appendFile(
            './activate_session.csv',
            `${new Date().toLocaleString().replace(',', '')}, ${
              employer.employerNumber
            },failed\n`
          );
        }
      }
    } else {
      await sendMail('Error: Activate Session: Failed to get employers');
    }
  } catch (err) {
    console.error(err);
  }
}
