import path from 'path';

import session from '../../lib/session.js';

import { getTextMessage } from '../../utils/languages.js';
import {
  sendCtaUrlButton,
  sendLocation,
  sendLocationCta,
  sendTextMessage,
  sendVideo,
} from '../../utils/messages.js';

import {
  markAttendance,
  sendAttendanceNotification,
} from '../../utils/utils.js';

export default async function handleAttendanceLocation(
  message,
  recipientPhone  
) {
  const user = session.get(recipientPhone).user;

  const { language } = user;

  const { latitude, longitude } = message.location;

  session.get(recipientPhone).longitude = longitude;
  session.get(recipientPhone).latitude = latitude;

  const hasThread = Boolean(message?.thread);
  const hasName = Boolean(message.location.name || message.location.url);

  const isAnyLocation = user.locations.find(
    (location) => location.name === 'Any Location'
  );

  if (!isAnyLocation) {
    const isInRangeArray = await Promise.all(
      user.locations.map(async (location) => {
        const inRange = checkIsInRange(location, latitude, longitude);
        return inRange;
      })
    );

    const isAnyLocationInRange = isInRangeArray.some((result) => result);

    if (isAnyLocationInRange) {
      if (hasThread) {
        if (hasName) {
          const message = getTextMessage(language, 'currentLocation');
          return await sendLocationCta({ recipientPhone, message });
        }

        if (user.proof.image) {
          if (user.companyId === process.env.HONDA_COMPANY_ID) {
            await sendCtaUrlButton({
              message: `Click on the below button "Click Photo" to open link in your browser to click a photo and mark your attendace.`,
              recipientPhone,
              buttonName: 'Click Photo',
              url: `https://autowhat-attendance-checkin.vercel.app/click-photo/${recipientPhone}/${
                session.get(recipientPhone).action
              }"`,
            });
          } else {
            const message = getTextMessage(language, 'attendanceLocation');
            await sendTextMessage(message, recipientPhone);
          }

          session.get(recipientPhone).session = 'markAttendance';
        } else {
          const { name, address } = await markAttendance(
            session.get(recipientPhone).action,
            recipientPhone,
            {},
            user
          );

          await sendLocation({
            recipientPhone,
            latitude,
            longitude,
            name,
            address,
          });

          await sendAttendanceNotification(
            user.employerNumber,
            user.companyId,
            {
              latitude,
              longitude,
              name,
              address,
            }
          );
        }
      } else {
        const message = getTextMessage(language, 'clickAttendanceLocation');

        await sendVideo({
          caption: message,
          file_path: path.join(
            process.env.ROOT_PATH,
            '/public/locaton-example.mp4'
          ),
          recipientPhone,
        });
      }
    } else {
      const message = getTextMessage(language, 'locNotInRange');
      await sendTextMessage(message, recipientPhone);

      session.delete(recipientPhone);
    }
  } else {
    if (hasThread) {
      if (hasName) {
        const message = getTextMessage(language, 'currentLocation');
        return await sendTextMessage(message, recipientPhone);
      }

      if (user.proof.image) {
        if (user.companyId === process.env.HONDA_COMPANY_ID) {
          await sendCtaUrlButton({
            message: `Click on the below button "Click Photo" to open link in your browser to click a photo and mark your attendace.`,
            recipientPhone,
            buttonName: 'Click Photo',
            url: `https://autowhat-attendance-checkin.vercel.app/click-photo/${recipientPhone}/${
              session.get(recipientPhone).action
            }"`,
          });
        } else {
          const message = getTextMessage(language, 'attendanceLocation');
          await sendTextMessage(message, recipientPhone);
        }

        session.get(recipientPhone).session = 'markAttendance';
      } else {
        const { name, address } = await markAttendance(
          session.get(recipientPhone).action,
          recipientPhone,
          { lat: latitude, long: longitude },
          user
        );
        await sendLocation({
          recipientPhone,
          latitude,
          longitude,
          name,
          address,
        });

        await sendAttendanceNotification(user.employerNumber, user.companyId, {
          latitude,
          longitude,
          name,
          address,
        });
      }
    } else {
      const message = getTextMessage(language, 'clickAttendanceLocation');

      await sendVideo({
        caption: message,
        file_path: path.join(
          process.env.ROOT_PATH,
          '/public/locaton-example.mp4'
        ),
        recipientPhone,
      });
    }
  }
}

function checkIsInRange(location, recipientLat, recipientLong) {
  const distance = calculateDistance(
    location.lat,
    location.long,
    recipientLat,
    recipientLong
  );

  if (distance > location.range) {
    return false;
  } else {
    return true;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c * 1000;

  return distance;
}
