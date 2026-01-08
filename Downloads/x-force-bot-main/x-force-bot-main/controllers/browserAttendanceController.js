import fs from "fs/promises";
import { ObjectId } from "mongodb";

import session from "../lib/session.js";
import { isRecipientRegistered } from "./whatsappMessageController.js";
import {
  checkIsInRange,
  isCheckIn,
  markAttendance,
  uploadMedia,
  delay
} from "../utils/utils.js";
import { uploadFileToBucket } from "../utils/bucket.js";
import { sendImage, sendSimpleButtonsWithImage } from "../utils/messages.js";
import Employee from "../models/employeeModel.js";
import Employer from "../models/employerModel.js";

export const browserAttendanceController = async (req, res) => {
  try {
    const body = req.body;

    console.log(body, "browser check in");

    if (!body.latitude && !body.longitude) {
      return res.json({
        status: "failed",
        message: "Location not found. refresh page and try again",
      });
    }

    const employeeNumber = Number(body.employeeNumber);

    const isRegistered = await isRecipientRegistered(employeeNumber, session);

    if (isRegistered) {
      const userSession = session.get(employeeNumber);

      const isAnyLocation = userSession.user.locations.find(
        (location) => location.name === "Any Location"
      );

      if (!isAnyLocation) {
        const isInRangeArray = await Promise.all(
          userSession.user.locations.map(async (location) => {
            const inRange = checkIsInRange(
              location,
              body.latitude,
              body.longitude
            );
            return inRange;
          })
        );

        const isAnyLocationInRange = isInRangeArray.some((result) => result);

        if (!isAnyLocationInRange) {
          return res.json({
            status: "failed",
            message:
              "You are unable to mark attendance because your current location falls outside the geo-fencing area. try to mark attendance within the specified location.",
          });
        }
      }

      const checkIn = await isCheckIn(userSession.user);

      if (checkIn.attendance) {
        return res.json({ status: "failed", message: "Already Checked-In" });
      }

      const attendanceType = body.attendanceType;

      const imageName = `${employeeNumber}-${Date.now()}.png`;

      const uploadRes = await uploadFileToBucket(req.file.path, imageName);

      if (uploadRes.status === "success") {
        const url = uploadRes.url;
        const { name, address, id } = await markAttendance(
          attendanceType,
          employeeNumber,
          {
            [attendanceType === "in" ? "checkInPic" : "checkOutPic"]: url,
            lat: body.latitude,
            long: body.longitude,
          },
          userSession.user
        );

        await sendImage({
          recipientPhone: employeeNumber,
          url,
          caption: `${name}\\n${address}`,
        });

        res.status(200).json({
          status: "success",
          message: "Mark Attendance Success",
        });

        const mediaId = await uploadMedia(
          `/uploads/${req.file.filename}`,
          imageName
        );

        // const branches = userSession.user.locations
        //   .filter((location) => location.name !== "Any Location")
        //   .map((location) => location.name);

        const hods = await Employee.find(
          {
            companyId: userSession.user.companyId,
            department: userSession.user.department,
            role: "hod",
          },
          { employeeNumber: 1 }
        );

        const message = `A quick update to let you know that ${userSession.user.employeeName} has checked in at ${address}.`;
        const listOfButtons = [
          {
            id: `full-day@${id}`,
            title: "Full Day",
          },
          {
            id: `half-day@${id}`,
            title: "Half Day",
          },
          {
            id: `absent@${id}`,
            title: "Absent",
          },
        ];

        if (hods && hods.length > 0) {
          for (const hod of hods) {
            await delay(300);

            await sendSimpleButtonsWithImage({
              recipientPhone: hod.employeeNumber,
              message,
              listOfButtons,
              id: mediaId,
            });
          }
        }

        const employers = await Employer.find(
          {
            $or: [
              { companyId: userSession.user.companyId },
              { _id: new ObjectId(userSession.user.companyId) },
            ],
          },
          { employerNumber: 1 }
        );

        if (employers && employers.length > 0) {
          for (const employer of employers) {
            await delay(300);

            await sendImage({
              recipientPhone: employer.employerNumber,
              url,
              caption: message,
            });
          }
        }
      } else {
        return res.status(500).json({
          status: "error",
          message: "Failed to upload attendance photo",
        });
      }
    } else {
      return res.status(500).json({
        status: "error",
        message: "You are not registered",
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: "Failed to upload attendance photo",
    });
  } finally {
    fs.unlink(req.file.path);
  }
};
