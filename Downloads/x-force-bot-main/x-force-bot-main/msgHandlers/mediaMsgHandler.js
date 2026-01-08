import moment from "moment-timezone";

import {
  delay,
  markAttendance,
  sendAttendanceNotification,
  isCheckIn,
  getMediaUrl,
  downloadAndSave,
} from "../utils/utils.js";

import { getSimpleButtonsMessage, getTextMessage } from "../utils/languages.js";
import {
  sendSimpleButtons,
  sendLocation,
  sendImage,
  sendTextMessage,
} from "../utils/messages.js";

import { uploadToBucket } from "../utils/bucket.js";
import { join } from "path";
import Employee from "../models/employeeModel.js";

async function handleMediaMessage({ media, recipientPhone, session }) {
  const {
    latitude,
    longitude,
    user,
    session: sessionType,
    action,
  } = session.get(recipientPhone);

  const currentTime = moment.tz(new Date(), user.timeZone);
  const formattedTime = currentTime.format("DD/MM/YY hh:mm A");

  const imageId = media.image.id;
  const fileName = `${imageId}-${recipientPhone}.jpg`;

  if (sessionType === "employeeDemo") {
    const action = session.get(recipientPhone).action;
    const address = `Check-${action?.toUpperCase()} Success✅`;
    const name = formattedTime;

    await sendLocation({
      latitude,
      longitude,
      recipientPhone,
      name,
      address,
    });

    await sendLocation({
      latitude,
      longitude,
      recipientPhone: user.employerNumber,
      name,
      address: `${address} by ${user.employeeName} - Demo`,
    });

    await delay(2500);

    const { message, listOfButtons } = getSimpleButtonsMessage(
      user.language,
      "startLeaveRequest",
      [],
      "main"
    );
    await sendSimpleButtons(message, listOfButtons, recipientPhone);

    return;
  }

  const mediaUrl = await getMediaUrl(imageId);

  if (sessionType === "broadcast") {
    const broadcastMessage = session.get(recipientPhone).broadcastMessage;
    const employees = session.get(recipientPhone).employees;

    const isSaved = await downloadAndSave(mediaUrl, fileName);

    if (isSaved) {
      await Promise.allSettled(
        employees.map((employee) => {
          return sendImage({
            caption: broadcastMessage,
            file_path: join(process.env.ROOT_PATH, fileName),
            recipientPhone: employee,
          });
        })
      );
    }

    const message = getTextMessage(
      session.get(recipientPhone).user.language,
      "broadcasted",
      [],
      "main"
    );

    await sendTextMessage(message, recipientPhone);
    session.delete(recipientPhone);
    return;
  }

  if (mediaUrl) {
    const response = await uploadToBucket(mediaUrl, fileName);

    if (response.status === "success") {
      const picUrl = response.url;

      if (sessionType === "markAttendance") {
        if (action === "in" || action === "out") {
          const attendanceData = {
            checkInPic: action === "in" ? picUrl : "none",
            checkOutPic: action === "out" ? picUrl : "none",
            lat: latitude,
            long: longitude,
          };

          const { name, address } = await markAttendance(
            action,
            recipientPhone,
            attendanceData,
            user
          );

          await sendLocation({
            recipientPhone,
            latitude,
            longitude,
            name,
            address,
          });

          if (user.companyId === process.env.APML_SECURITY_COMPANY_ID) {
            const department = user.department[0];

            const message = `A quick update to let you know that ${user.employeeName
              } has ${action === "in" ? "checked in" : "checked out"
              } at ${address}.`;

            if (department) {
              await sendImage({
                recipientPhone: department.head.number,
                url: picUrl,
                caption: message,
              });
            }
          } else {
            await sendAttendanceNotification(
              user.employerNumber,
              user.companyId,
              {
                latitude,
                longitude,
                name: `${name} by ${user.employeeName}`,
                address,
              }
            );
          }
        }

        session.delete(recipientPhone);
      } else if (sessionType === "manual_punching") {
        const id = session.get(recipientPhone).id;
        const manualImage = await Employee.findOne({
          _id: id,
          isActive: true,
        });

        await markAttendance(
          "in",
          recipientPhone,
          {
            checkInPic: picUrl,
          },
          {
            ...manualImage,
            employeeId: id,
            companyId: user.companyId,
            checkIn: moment.tz(manualImage.checkIn, manualImage.timeZone),
          }
        );

        let message = "Mark Attendance Successfully.";
        await sendTextMessage(message, recipientPhone);
      } else {
        const checkedIn = await isCheckIn(session.get(recipientPhone).user);

        if (checkedIn.isGreater) {
          const { message, listOfButtons } = getSimpleButtonsMessage(
            session.get(recipientPhone)?.user?.language,
            "addToLogs",
            [],
            "main"
          );
          await sendSimpleButtons(
            message,
            listOfButtons(checkedIn.attendance._id.toString()),
            recipientPhone
          );

          session.get(recipientPhone).logPicUrl = picUrl;
        }
      }
    }
  }
}

export default handleMediaMessage;
