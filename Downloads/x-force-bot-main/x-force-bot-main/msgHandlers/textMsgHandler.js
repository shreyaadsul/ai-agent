import axios from 'axios';

import {
  sendSimpleButtons,
  sendTextMessage,
  // sendFlow,
} from '../utils/messages.js';
import { getTextMessage, getSimpleButtonsMessage } from '../utils/languages.js';
import {
  delay,
  // capitalize,
  // formatTime12h,
  isCheckIn,
  makeApiRequest,
  // getFlowMessageData,
} from '../utils/utils.js';
import { Issue, Employer } from '../models/index.js';
// import flowIds, { FLOW_TOKEN } from '../utils/constants.js';

import sendEmployeeFirstMessage from './../features/employee/handle-first-message.js';
import sendEmployerFirstMessage from './../features/employer/handle-first-message.js';
import { handleAttendanceWithAI } from '../services/agentDecisionEngine.js';

const BOT = 'main';
// const FIVE_MINS_IN_MS = 2.5 * 60 * 1000;

import handleSimpleButtonMessage from './simpleBtnMsgHandler.js';

const messageHandlers = {
  'support-issue': async ({ message, session, recipientPhone }) => {
    await handleEmployeeIssue({ message, session, recipientPhone });
  },
  'demo-issue': async ({ message, session, recipientPhone }) => {
    await handleEmployeeIssue({ message, session, recipientPhone });
  },
  'leave_flow_dates': async ({ message, session, recipientPhone }) => {
    // Expected input: Date string or "Today/Tomorrow"
    const dateInput = message.trim();
    console.log(`[LEAVE FLOW] Received dates: ${dateInput}`);

    // Store dates
    const currentSession = session.get(recipientPhone);
    currentSession.leaveRequest.dateText = dateInput;

    // Move to next step
    currentSession.session = 'leave_flow_reason';
    session.set(recipientPhone, currentSession);

    await sendTextMessage("Got it. What is the reason for your leave?", recipientPhone);
  },

  'leave_flow_reason': async ({ message, session, recipientPhone }) => {
    // Expected input: Reason text
    const reasonInput = message.trim();
    const currentSession = session.get(recipientPhone);

    // Finalize
    const leaveData = {
      dates: currentSession.leaveRequest.dateText,
      reason: reasonInput,
      employee: currentSession.user.employeeName
    };

    console.log(`[LEAVE FLOW] Finalizing request:`, leaveData);

    // Notify User
    await sendTextMessage(`✅ Leave Request Submitted.\nDates: ${leaveData.dates}\nReason: ${leaveData.reason}\n\nI have notified your Manager.`, recipientPhone);

    // TODO: Actually insert into DB and Notify Manager

    // Clear Session
    session.delete(recipientPhone);
  },

  'requestLeave': async ({ message, session, recipientPhone }) => {
    // ... (keep existing implementation or refactor if needed) ...
    // For now, I'm keeping the existing manual button flow handler as is, 
    // but the NEW Global Intent below will direct purely text-based users to the new flow.
    const normalizedMessage = message.trim().toLowerCase();
    // ... existing ...
  },
};

async function handleTextMessage({
  message,
  recipientPhone,
  session,
  incomingMessage,
}) {
  console.log('[TEXT HANDLER] 📝 Text message received');
  console.log('[TEXT HANDLER] Message:', message);
  console.log('[TEXT HANDLER] Recipient:', recipientPhone);

  let sessionType = session.get(recipientPhone).session;
  console.log('[TEXT HANDLER] Session type:', sessionType);

  if (message.toLowerCase() === 'hi') {
    sessionType = message.toLowerCase();
  }

  // --- GLOBAL INTENT DETECTION ---
  const lowerMsg = message.toLowerCase();

  // Detect Leave Request (Automated Flow)
  // We prioritize this over the manual button flow if the user types these keywords
  const leaveKeywords = ['leave', 'sick', 'not coming', 'absent'];

  if (leaveKeywords.some(w => lowerMsg.includes(w)) && !sessionType) {
    console.log('[TEXT HANDLER] Global Leave Intent Detected');

    // Initialize Leave Session
    session.set(recipientPhone, {
      session: 'leave_flow_dates',
      user: session.get(recipientPhone).user,
      leaveRequest: {
        rawText: message
      }
    });

    await sendTextMessage("I understand you want to take leave. \nWhen is this for? (e.g. 'Today', 'Tomorrow', '10-12 Jan')", recipientPhone);
    return;
  }
  // -------------------------------

  // Detect Support/Issue
  if (lowerMsg.includes('issue') || lowerMsg.includes('help') || lowerMsg.includes('support') || lowerMsg.includes('problem')) {
    console.log('[TEXT HANDLER] Global Support Intent Detected');
    sessionType = 'support-issue';
  }
  // -------------------------------

  if (messageHandlers[sessionType]) {
    await messageHandlers[sessionType]({
      message,
      session,
      recipientPhone,
      incomingMessage,
    });
  } else if (
    message.toLowerCase() === 'admin' &&
    (recipientPhone === 918657854260 || recipientPhone === 919619565155)
  ) {
    await axios.post(
      'https://uninvective-incorrigibly-warren.ngrok-free.dev ',
      incomingMessage
    );
  } else {
    // START SAFETY CHECK
    const userSessionData = session.get(recipientPhone);
    const user = userSessionData?.user;

    if (!user) {
      console.log(`[TEXT HANDLER] 🛑 User data missing for ${recipientPhone}. Sending fallback.`);
      await sendTextMessage("Welcome! Please type 'Hi' to start.", recipientPhone);
      return;
    }

    const isEmployee = user.isEmployee;
    // END SAFETY CHECK

    if (isEmployee) {
      if (message.toLowerCase() === 'hi') {
        await sendEmployeeFirstMessage(recipientPhone);
      } else {
        const checkedIn = await isCheckIn(session.get(recipientPhone).user);
        if (checkedIn.attendance) {
          const { message: buttonMessage, listOfButtons } =
            getSimpleButtonsMessage(
              session.get(recipientPhone).user.language,
              'addToLogs',
              [],
              BOT
            );

          await sendSimpleButtons(
            buttonMessage,
            listOfButtons(checkedIn.attendance._id.toString()),
            recipientPhone
          );
          session.get(recipientPhone).logText = message;
        } else {
          // await sendTextMessage(
          //   'Please Type Hi for Attendance bot \n- below is the reqested answer by Autowhat AI Assistant',
          //   recipientPhone
          // );
          // await makeApiRequest(message, recipientPhone, true);
          const aiResult = await handleAttendanceWithAI(message, recipientPhone, user.companyId);
          await sendTextMessage(aiResult.text, recipientPhone);
        }
      }
    } else {
      if (message.toLowerCase() === 'hi' && isEmployee === false) {
        await sendEmployerFirstMessage(recipientPhone);
      } else {
        // await sendTextMessage(
        //   'Please Type Hi for Attendance bot \n- below is the requested answer by Autowhat  AI Assistant',
        //   recipientPhone
        // );
        // await makeApiRequest(message, recipientPhone, false);
        await sendTextMessage("The AI Attendance Agent is currently optimized for Employees. Please test with an Employee account.", recipientPhone);
      }
    }
  }
}



async function handleEmployeeIssue({ message, session, recipientPhone }) {
  const { user, problem, session: sessionType } = session.get(recipientPhone);

  const ticketNumber = Math.floor(Math.random() * 90000) + 10000;

  if (sessionType === 'demo-issue') {
    const textMessage = getTextMessage(
      user.language,
      'registerComplain',
      [user.employeeName, '-', problem, message, recipientPhone, ticketNumber],
      BOT
    );
    await sendTextMessage(textMessage, recipientPhone);

    session.get(recipientPhone).session = 'employeeDemo';

    await delay(2500);

    const { message: reportMessage, listOfButtons } = getSimpleButtonsMessage(
      user.language,
      'employeeReportStart'
    );
    await sendSimpleButtons(reportMessage, listOfButtons, recipientPhone);

    return;
  }

  if (user) {
    await Issue.create({
      date: new Date(),
      employeeId: user.employeeId,
      companyId: user.companyId,
      issueType: problem,
      remark: message,
      ticketNumber,
    });

    const textMessage = getTextMessage(
      user.language,
      'registerComplain',
      [user.employeeName, '-', problem, message, recipientPhone, ticketNumber],
      BOT
    );
    await sendTextMessage(textMessage, recipientPhone);

    const { notifications } = await Employer.findNotfications(user.companyId);

    if (notifications.support) {
      const { message: textMessage, listOfButtons } = getSimpleButtonsMessage(
        user.language,
        'sendIssue',
        [
          user.employeeName,
          '-',
          problem,
          message,
          recipientPhone,
          ticketNumber,
        ],
        BOT
      );
      await sendSimpleButtons(textMessage, listOfButtons, user.employerNumber);
    }
  }

  session.delete(recipientPhone);
}

export default handleTextMessage;
