import moment from 'moment-timezone';
import session from '../../lib/session.js';

import { getSimpleButtonsMessage } from '../../utils/languages.js';
import { sendSimpleButtons } from '../../utils/messages.js';
import { getGreeting, isCheckIn } from '../../utils/utils.js';

export default async function handleFirstEmployeeMessage(recipientPhone) {
  const user = session.get(recipientPhone).user;

  const employeeName = user.employeeName;

  let checkIn = await isCheckIn(user);

  if (checkIn.isGreater) {
    const checkedInTime = moment.tz(checkIn.attendance.checkInTime, user.timeZone);

    const { hours, minutes } = getTimeElapsed(checkedInTime, user.timeZone);

    checkIn = `You checked in at ${checkedInTime.format(
      'hh:mm A'
    )}.\nIt's been `;

    if (hours > 0) {
      checkIn += `${hours} hours and `;
    }

    checkIn += `${minutes} minutes since you checked in.`;

    // session.get(recipientPhone).checkInTime = checkInTime;
  } else {
    checkIn =
      'Not checked in yet.\n\nClick Mark Attendance button to check in.';
  }

  const greeting = getGreeting(user.timeZone);

  const { message, listOfButtons } = getSimpleButtonsMessage(
    user.language,
    'hi',
    [greeting, employeeName, checkIn]
  );

  await sendSimpleButtons(message, listOfButtons(), recipientPhone);
}

function getTimeElapsed(checkInTime, timeZone) {
  const checkedInTime = moment.tz(checkInTime, timeZone);
  const currentTime = moment.tz(new Date(), timeZone);

  // Calculate the difference in milliseconds
  const duration = moment.duration(currentTime.diff(checkedInTime));

  // Get the hours and minutes from the duration
  const hours = Math.floor(duration.asHours());
  const minutes = duration.minutes();

  return { hours, minutes };
}
