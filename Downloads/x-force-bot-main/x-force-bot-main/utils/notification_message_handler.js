import path from 'path';
import fs from 'fs/promises';

import {
  NotificationMessageLog,
  Employer,
  SessionExpiration,
  SentMessageLog,
} from '../models/index.js';

export const notificationMessageHandler = async (notificationMessage) => {
  const status = notificationMessage.status;
  const phone =
    notificationMessage.recipient_id ||
    notificationMessage.from?.phone;
  const messageId = notificationMessage.id;

  // Store complete data in MongoDB
  try {
    const res = await NotificationMessageLog.create({
      data: {
        metadata: notificationMessage.metadata || {},
        contacts: notificationMessage.contacts || {},
        WABA_ID: notificationMessage.WABA_ID,
        isNotificationMessage:
          notificationMessage.isNotificationMessage || false,
        isMessage: notificationMessage.isMessage || false,
        status: status,
        phone: phone,
        messageId: messageId,
        rawNotification: notificationMessage,
      },
    });
  } catch (mongoErr) {}

  // Update message status in our logs
  try {
    const res = await SentMessageLog.findOneAndUpdate(
      { messageId },
      { status: status === 'failed' ? 'failed' : status },
      { upsert: true }
    );
  } catch (err) {
    console.error('Failed to update message status:', err);
  }

  // Store conversation expiration data
  try {
    const expirationTimestamp =
      notificationMessage.notificationMessage?.conversation
        ?.expiration_timestamp;
    if (expirationTimestamp) {
      const phoneNumber = parseInt(phone);
      const employer = await Employer.findOne({ employerNumber: phoneNumber });

      if (employer) {
        const currentTime = new Date();
        const expirationTime = new Date(Number(`${expirationTimestamp}000`));

        // Check for existing active session
        const existingSession = await SessionExpiration.findOne({
          phone,
          status: 'active',
        });

        // Create new session only if no active session exists
        if (!existingSession) {
          const todayDate = new Date()
            .toLocaleDateString('en-GB', {
              timeZone: 'Asia/Kolkata',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
            .split('/')
            .reverse()
            .join('-');

          const res = await SessionExpiration.findOneAndUpdate(
            {
              phone,
              sessionDate: todayDate,
            },
            {
              expirationTime: expirationTime,
              status: currentTime > expirationTime ? 'expired' : 'active',
            },
            { upsert: true }
          );
        } else {
        }
      }
    }
  } catch (err) {
    console.error('Failed to save session expiration data:', err);
  }

  // CSV handling logic
  const dateTime = new Date(
    Number(`${notificationMessage.timestamp}000`)
  ).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour12: true });

  const origin =
    notificationMessage.conversation?.origin?.type;
  let csvLine = `\n${phone}, ${dateTime}, ${status}, ${messageId}, ${origin}`;

  const error = notificationMessage.errors?.[0];

  if (status === 'failed') {
    const title = error?.title;
    const message = error?.message;
    const details = error?.error_data?.details;

    csvLine += `, ${title}, ${message}, ${details}`;
    // failedMessageHandler(phone, error.code);
  }

  const csvFilePath = path.join(process.env.ROOT_PATH, 'notificationLogs.csv');
  await fs.appendFile(csvFilePath, csvLine);
};
