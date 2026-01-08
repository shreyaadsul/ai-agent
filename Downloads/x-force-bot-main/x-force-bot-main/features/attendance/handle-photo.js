import session from "../../lib/session";

import { uploadToBucket } from "../../utils/bucket";
import { getSimpleButtonsMessage } from "../../utils/languages";
import { sendLocation, sendSimpleButtons, sendTextMessage } from "../../utils/messages";
import { getMediaUrl, isCheckIn, markAttendance, sendAttendanceNotification } from "../../utils/utils";

export default async function handelAttendancePhoto(mediaId, recipientPhone) {
  const fileName = `${mediaId}-${recipientPhone}.jpg`;

  const mediaUrl = await getMediaUrl(mediaId);

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

        session.delete(recipientPhone);
      } else {
        const checkedIn = await isCheckIn(session.get(recipientPhone).user);

        if (checkedIn.attendance) {
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
    } else {
      await sendTextMessage("Failed to Download Photo", recipientPhone);
    }
  } else {
    await sendTextMessage("Failed to Download Photo", recipientPhone);
  }
}
