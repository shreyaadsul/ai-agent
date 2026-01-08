import session from '../../lib/session.js';

import { getTextMessage } from '../../utils/languages.js';
import {
  sendCtaUrlButton,
  sendLocationCta,
  sendTextMessage,
} from '../../utils/messages.js';
import { markAttendance } from '../../utils/utils.js';

export default async function HandleInOut(buttonId, recipientPhone) {
  const user = session.get(recipientPhone).user;
  const { language, proof, companyId } = user;

  session.get(recipientPhone).action = buttonId;
  session.get(recipientPhone).session = 'markAttendance';

  if (proof.location) {
    if (companyId === process.env.HONDA_COMPANY_ID) {
      await sendClickPhotoMessage(recipientPhone, buttonId);
    } else {
      const message = getTextMessage(language, buttonId);
      await sendLocationCta({ message, recipientPhone });
    }
  } else if (proof.image) {
    session.get(recipientPhone).latitude = '0';
    session.get(recipientPhone).longitude = '0';

    if (companyId === process.env.HONDA_COMPANY_ID) {
      await sendClickPhotoMessage(recipientPhone, buttonId);
    } else {
      const message = getTextMessage(language, 'attendanceLocation');
      await sendTextMessage(message, recipientPhone);
    }
  } else {
    const { name, address } = await markAttendance(
      buttonId,
      recipientPhone,
      {},
      user
    );

    await sendTextMessage(`${address}\n${name}`, recipientPhone);
  }
}

async function sendClickPhotoMessage(recipientPhone, action) {
  await sendCtaUrlButton({
    message: `Click on the below button "Click Photo" to open link in your browser to click a photo and mark your attendace.`,
    recipientPhone,
    buttonName: 'Click Photo',
    url: `https://autowhat-attendance-checkin.vercel.app/click-photo/${recipientPhone}/${action}`,
  });
}
