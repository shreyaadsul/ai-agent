import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: ".env" });

import { getTextMessage } from "../utils/languages.js";
import {
  sendTextMessage,
  sendVideo,
  sendFlow,
  sendLocation,
  sendLocationCta,
} from "../utils/messages.js";
import {
  getTimeZone,
  markAttendance,
  sendAttendanceNotification,
  getFlowMessageData,
  calculateDistance,
} from "../utils/utils.js";

import { Whatsapp } from "../controllers/whatsappMessageController.js";

import Employee from "../models/employeeModel.js";

import {
  LINK_BRANCH_FLOW_ID,
  LINK_BRANCH_FLOW_TOKEN,
  ADD_BRANCH_FLOW_ID,
  ADD_BRANCH_FLOW_TOKEN,
} from "../utils/constants.js";

import handleAttendanceLocation from "../features/attendance/handle-location.js"

const BOT = "main";

async function handleLocationMessage({ incomingMessage, recipientPhone, session }) {
  const { user, session: sessionType, action } = session.get(recipientPhone);

  const hasThread = Boolean(incomingMessage.thread);
  const hasName = Boolean(incomingMessage.location.name || incomingMessage.location.url);

  const { longitude, latitude } = incomingMessage.location;
  const { locations, language } = user;

  session.get(recipientPhone).latitude = latitude;
  session.get(recipientPhone).longitude = longitude;

  if (sessionType === "employeeDemo") {
    if (hasThread) {
      const message = getTextMessage(language, "attendanceLocation", [], BOT);
      await Whatsapp.sendImage({
        recipientPhone,
        caption: message,
        url: "https://cdn.discordapp.com/attachments/997267733513261188/1178337649342287952/Adityabanka_SINGLE_AERIAL_VIEW_view_OF_SINGLE_very_beautiful_in_63db8846-3aa3-4e1a-909b-1cb311c749b2.png",
      });
    } else {
      const message = getTextMessage(language, "clickAttendanceLocation", [], BOT);
      await sendVideo({
        caption: message,
        file_path: path.join(process.env.ROOT_PATH, "/public/locaton-example.mp4"),
        recipientPhone,
      });
    }

    return;
  } else if (sessionType === "awaiting_checkin_location") {
    // --- AUTOMATION: Manual/Auto Check-in Flow ---
    console.log(`[LOCATION HANDLER] Processing Check-in for ${recipientPhone}`);

    const officeLat = user.geoFencing?.centerLat || user.locations?.[0]?.lat; // Fallback to first location
    const officeLong = user.geoFencing?.centerLong || user.locations?.[0]?.long;
    const allowedRadiusKm = (user.geoFencing?.radiusMeters || 200) / 1000;

    if (!officeLat || !officeLong) {
      await sendTextMessage("⚠️ No office location configured for you. Please contact admin.", recipientPhone);
      return;
    }

    const distance = calculateDistance(officeLat, officeLong, latitude, longitude);
    console.log(`[LOCATION HANDLER] Distance: ${distance.toFixed(3)}km, Allowed: ${allowedRadiusKm}km`);

    if (distance <= allowedRadiusKm) {
      // Success: Mark Attendance
      // We mock 'checkInPic' as 'Auto-Location'
      const attendanceData = {
        lat: latitude,
        long: longitude,
        checkInPic: "Auto-Location-Data",
      };

      const result = await markAttendance("in", recipientPhone, attendanceData, user);

      if (result) {
        await sendTextMessage(`✅ *Check-in Successful!*\n📍 Distance from office: ${(distance * 1000).toFixed(0)}m\nTime: ${new Date().toLocaleTimeString()}`, recipientPhone);
        session.delete(recipientPhone);
      }
    } else {
      // Failure: Ask for reason
      await sendTextMessage(`⚠️ *You are ${(distance).toFixed(2)}km away from office.*\n\nYou are outside the allowed range. \nPLEASE REPLY with a *Reason* to complete your check-in manually.`, recipientPhone);

      // Update session to wait for reason
      const currentSession = session.get(recipientPhone);
      currentSession.session = 'awaiting_late_reason'; // or awaiting_remote_reason
      currentSession.temp_location_data = { lat: latitude, long: longitude };
      session.set(recipientPhone, currentSession);
    }
    return;

  } else if (sessionType === "employeeSignup") {
    let timezoneInfo = {};

    if (latitude && longitude) {
      timezoneInfo = await getTimeZone(latitude, longitude, recipientPhone);

      if (timezoneInfo) {
        const res = await Employee.updateOne(
          {
            _id: user.employeeId,
            employeeNumber: Number(recipientPhone),
          },
          {
            countryName: timezoneInfo?.countryName,
            countryCode: timezoneInfo?.countryCode,
            timeZone: timezoneInfo?.timeZone,
            regionName: timezoneInfo?.regionName,
          }
        );

        if (res && res.acknowledged) {
          const message = getTextMessage(language, "employeeDemoCompleted", [], BOT);

          await Whatsapp.sendImage({
            recipientPhone,
            caption: message,
            url: "https://i.postimg.cc/mkDw3z3t/Copy-of-Hi.png",
          });

          session.delete(recipientPhone);
        }
      } else {
        const message = getTextMessage(language, "sendLocationAgain", [], BOT);
        await sendTextMessage(message, recipientPhone);
      }
    }

    return;
  }

  if (user.isEmployee) {

    if (sessionType === "markAttendance") {
      await handleAttendanceLocation({ location: { ...incomingMessage.location }, thread: incomingMessage?.thread?.from }, recipientPhone)
    }

  } else if (!user.isEmployee) {
    const employees = await Employee.find(
      {
        companyId: user.companyId,
        isActive: true,
      },
      { employeeName: 1, employeeNumber: 1 }
    ).limit(22);

    console.log(employees.length, sessionType)

    let branchEmployees = employees?.map((employee) => {
      return {
        id: employee.employeeNumber.toString(),
        title: employee.employeeName.slice(0, 20),
      };
    });

    if (branchEmployees.length === 0) {
      branchEmployees = [{ id: "no-employees", title: "No employees" }];
    }

    if (sessionType === "addBranch" || employees.length === 0) {
      const message = getTextMessage(user.language, "addBranch", [], BOT);

      const { flow, flowBody } = getFlowMessageData(message);

      const flowData = {
        screen: "Add_Branch",
        data: {
          ...flow,
          coordinates: `${latitude}, ${longitude}`,
        },
      };

      await sendFlow({
        body: flowBody,
        flow_cta: "Add Place",
        flow_id: ADD_BRANCH_FLOW_ID,
        flow_data: flowData,
        flow_token: ADD_BRANCH_FLOW_TOKEN,
        recipientPhone,
      });

      session.get(recipientPhone).session = "signupgeofencing";
    } else {
      const message = getTextMessage(user.language, "link_employee", [], BOT);

      const { flow, flowBody } = getFlowMessageData(message);

      const flowData = {
        screen: "Add_Branch",
        data: {
          ...flow,
          all_extras: branchEmployees,
          coordinates: `${latitude},${longitude}`,
        },
      };

      session.get(recipientPhone).session = "addPlace";

      await sendFlow({
        body: flowBody,
        flow_cta: "Add Place",
        flow_data: flowData,
        flow_id: LINK_BRANCH_FLOW_ID,
        flow_token: LINK_BRANCH_FLOW_TOKEN,
        recipientPhone,
      });
    }
  }
}

async function checkIsInRange(location, recipientLat, recipientLong) {
  // Use local or imported calculateDistance. Since we are editing this file, 
  // and the import isn't at the top yet, we can rely on the fact that existing code had it.
  // BUT the instruction was to Remove it. 
  // So I will assume I need to keep the function `checkIsInRange` working.

  // NOTE: I am keeping a local version here to match the Plan if I didn't import checks.
  // However, I CAN import it.

  const distance = calculateDistance(location.lat, location.long, recipientLat, recipientLong);
  if (distance > location.range) {
    return false;
  } else {
    return true;
  }
}



export default handleLocationMessage;
