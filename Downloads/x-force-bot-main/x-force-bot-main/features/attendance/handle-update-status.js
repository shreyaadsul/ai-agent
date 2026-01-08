import { Attendance } from "../../models/index.js";
import { sendTextMessage } from "../../utils/messages.js";

import moment from "moment-timezone";

export async function handleAttendanceUpdateStatus(
  attendanceDocumentId,
  status,
  recipientPhone,
  timeZone
) {
  const time = moment.tz(new Date(), timeZone).valueOf();

  const att = await Attendance.findOne(
    { _id: attendanceDocumentId },
    { _id: 1, createdAt: 1 }
  );

  if (!att) {
    throw new Error();
  }

  const createdAt =
    moment.tz(att.createdAt, timeZone).valueOf() + 2 * 60 * 60 * 1000;

  if (createdAt < time) {
    return await sendTextMessage(
      "cannot update attendance status two hours has passed.",
      recipientPhone
    );
  }

  const res = await Attendance.updateOne(
    { _id: attendanceDocumentId },
    { status }
  );

  if (res && res.acknowledged) {
    await sendTextMessage(
      "Attendance Status updated successfully",
      recipientPhone
    );
  } else {
    await sendTextMessage("Failed to update attendance status", recipientPhone);
  }
}
