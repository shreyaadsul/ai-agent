import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";

import { sendTextMessage, sendSimpleButtons, sendDocument, sendFlow } from "../utils/messages.js";
import { getTextMessage, getSimpleButtonsMessage } from "../utils/languages.js";
// import { createAllEmployeeReport, createLiveReport } from "../reports.js";
import { deleteFile } from "../utils/utils.js";
import { DATE_RANGE_FLOW_ID, DATE_RANGE_FLOW_TOKEN } from "../utils/constants.js";

import Employee from "../models/employeeModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootPath = path.dirname(__dirname);

const BOT = "main";

async function handleRadioButtonMessage({ buttonId, recipientPhone, session }) {
  const sessionType = session.get(recipientPhone).session;

  if (
    buttonId === "check-in" ||
    buttonId === "check-out" ||
    buttonId === "salary-issue" ||
    buttonId === "other-issue"
  ) {
    session.get(recipientPhone).problem = buttonId;

    const { session: sessionType } = session.get(recipientPhone);

    if (sessionType === "employeeDemo") {
      session.get(recipientPhone).session = "demo-issue";
    } else {
      session.get(recipientPhone).session = "support-issue";
    }

    const { language } = session.get(recipientPhone).user;

    const message = getTextMessage(language, "employeeIssue", [], BOT);

    await sendTextMessage(message, recipientPhone);
  } else if (sessionType?.split("-")[0] === "language") {
    session.get(recipientPhone).user.language = buttonId;

    if (sessionType?.split("-")[1] === "empdemo") {
      session.get(recipientPhone).session = "employeeDemo";
    } else {
      session.get(recipientPhone).session = "empSignup";

      const message = getTextMessage(buttonId, "timezoneLocation");
      await sendTextMessage(message, recipientPhone);

      return;
    }

    await Employee.updateOne(
      { employeeNumber: Number(recipientPhone) },
      { language: session.get(recipientPhone).user.language }
    );

    const { message, listOfButtons } = getSimpleButtonsMessage(
      buttonId,
      "employeeDemoStart",
      [],
      BOT
    );
    await sendSimpleButtons(message, listOfButtons, recipientPhone);
  } else if (buttonId === "liveReport") {
    let { companyId, language, timeZone } = session.get(recipientPhone).user;
    language = language.split("+")?.[1] ?? language;

    const isLiveReport = await createLiveReport(recipientPhone, companyId, language, timeZone);

    if (isLiveReport) {
      await sendDocument({
        recipientPhone,
        file_path: path.join(rootPath, `${recipientPhone}-liveReport.pdf`),
        caption: "Live Report",
      });
      await deleteFile(`${recipientPhone}-liveReport.pdf`);
    } else {
      await sendTextMessage("No data", recipientPhone);
    }
  } else if (buttonId === "yesterdayReport") {
    let { companyId, language, timeZone } = session.get(recipientPhone).user;
    language = language.split("+")?.[1] ?? language;

    const isLiveReport = await createLiveReport(
      recipientPhone,
      companyId,
      language,
      timeZone,
      "yesterday"
    );

    if (isLiveReport) {
      await sendDocument({
        recipientPhone,
        file_path: path.join(rootPath, `${recipientPhone}-yesterdayReport.pdf`),
        caption: "Yesterday Report",
      });
      await deleteFile(`${recipientPhone}-yesterdayReport.pdf`);
    } else {
      await sendTextMessage("No data", recipientPhone);
    }
  } else if (buttonId === "dateRangeReport") {
    const { registeredOn, language } = session.get(recipientPhone).user;
    const currentTime = new Date().getTime();

    const message = getTextMessage(language, buttonId, [], BOT);
    const flowData = {
      screen: "Date_Range",
      data: {
        minDate: registeredOn.toString(),
        maxDate: currentTime.toString(),
        ...message.label,
      },
    };

    await sendFlow({
      body: message.body,
      flow_cta: "Report",
      flow_data: flowData,
      flow_id: DATE_RANGE_FLOW_ID,
      flow_token: DATE_RANGE_FLOW_TOKEN,
      recipientPhone,
    });
  } else if (buttonId === "emp_master_sheet") {
    let { companyId, language } = session.get(recipientPhone).user;
    language = language.split("+")?.[1] ?? language;
    const isReport = await createAllEmployeeReport(recipientPhone, companyId, language);

    if (isReport) {
      await sendDocument({
        file_path: path.join(rootPath, `${recipientPhone}-allEmployeeReport.pdf`),
        caption: "All Employees Report",
        recipientPhone,
      });

      await fs.unlink(`${recipientPhone}-allEmployeeReport.pdf`);
    } else {
      sendTextMessage("There is no Employees.", recipientPhone);
    }
  }
}

export default handleRadioButtonMessage;
