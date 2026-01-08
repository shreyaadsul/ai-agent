import path from 'path';

import {
  sendSimpleButtons,
  sendTextMessage,
  sendDocument,
} from '../utils/messages.js';
import { getTextMessage } from '../utils/languages.js';
import HandleAttendanceInOut from '../features/attendance/handle-in-out.js';
import { handleAttendanceUpdateStatus } from '../features/attendance/handle-update-status.js';

async function handleQuickReplyMessage({ message, recipientPhone, session }) {

  if (
    message.button?.payload.startsWith('half-day') ||
    message.button?.payload.startsWith('full-day') ||
    message.button?.payload.startsWith('absent')
  ) {
    const [status, attendanceDocId] = message.button?.payload.split('@');

    await handleAttendanceUpdateStatus(
      attendanceDocId,
      status,
      recipientPhone,
      session.get(recipientPhone).timeZone
    );
  } else if (message.button?.payload === 'empdemo') {
    const textMessage =
      ' *Welcome to the Interactive demo of AutoWhat Attendance on WhatsApp!* \n\nPlease select language from below';
    const listOfButtons = [
      {
        id: 'singlelanguage@directStart',
        title: 'One Language',
      },
      {
        id: 'duallanguage@directStart',
        title: 'English+One Language',
      },
    ];

    await sendSimpleButtons(textMessage, listOfButtons, recipientPhone);

    session.get(recipientPhone).session = 'employeeSignup';
  } else if (message.button?.payload === 'brochure') {
    await sendDocument({
      file_path: path.join(process.env.ROOT_PATH, '/public/brochure.pdf'),
      caption: 'Attendance Bot Brochure',
      recipientPhone,
    });
  } else if (message.button?.payload === 'dontwork') {
    await sendTextMessage(
      'Sorry for disturbing you. We let know the concerned person that you dont work here.\nHave a Great Day',
      recipientPhone
    );
  } else if (message.button?.payload === 'activateSession') {
    const message = getTextMessage(
      session.get(recipientPhone)?.user?.language,
      'sessionActivated',
      [],
      'main'
    );
    await sendTextMessage(message, recipientPhone);
  } else if (message.button?.payload === 'directStart') {
    const user = session.get(recipientPhone)?.user;
    const data = `${JSON.stringify({
      action: 'employeeSignup',
      recipientPhone,
      employeeId: user.employeeId,
      companyId: user.companyId,
    })}`;

    const textMessage =
      ' *Welcome to the Interactive demo of AutoWhat Attendance on WhatsApp!* \n\nPlease select language from below';
    const listOfButtons = [
      {
        id: `singlelanguage@${data}`,
        title: 'One Language',
      },
      {
        id: `duallanguage@${data}`,
        title: 'English+One Language',
      },
    ];

    await sendSimpleButtons(textMessage, listOfButtons, recipientPhone);

    session.get(recipientPhone).session = 'employeeSignup';
  } else if (message.button?.payload === 'check_in') {
    await HandleAttendanceInOut('in', recipientPhone);
  }
}

export default handleQuickReplyMessage;
