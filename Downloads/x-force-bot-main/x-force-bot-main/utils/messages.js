import axios from 'axios';
import dotenv from 'dotenv';

import { delay, getFlowMessageData, uploadMedia } from './utils.js';
import { getTextMessage } from './languages.js';
import { LANGUAGES_FLOW_ID, LANGUAGES_FLOW_TOKEN } from './constants.js';

dotenv.config({ path: '.env' });

// Whatsapp instance will be injected from the controller to avoid circular import
let Whatsapp = null;
export function setWhatsappInstance(w) {
  Whatsapp = w;
}
import { formatTimeByTimezoneInHrMin } from './time.js';
import FLOW_CREDS from './constants.js';

export const WHATSAPP_API = axios.create({
  baseURL: `https://graph.facebook.com/v18.0/${process.env.Meta_WA_SenderPhoneNumberId}`,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.Meta_WA_accessToken}`,
  },
});

async function sendSimpleButtonsWithImage({
  id,
  message,
  listOfButtons,
  recipientPhone,
  link,
}) {
  const obj = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'INTERACTIVE',
    interactive: {
      type: 'button',
      header: {
        type: 'image',
        image: {
          id,
          link,
        },
      },
      body: {
        text: message,
      },
      action: {
        buttons: listOfButtons.map((button) => ({
          type: 'reply',
          reply: button,
        })),
      },
    },
  };

  await WHATSAPP_API.post('/messages', obj);
}

async function sendSimpleButtons(message, listOfButtons, recipientPhone) {
  try {
    return await Whatsapp.sendSimpleButtons({
      message,
      recipientPhone,
      listOfButtons,
    });
  } catch (error) {
    console.error(error, 'error');
  }
}

async function sendTextMessage(message, recipientPhone) {
  try {
    return await Whatsapp.sendText({ message, recipientPhone });
  } catch (error) {
    console.error(error, 'error');
  }
}

async function sendRadioButtons(
  message,
  listOfSections,
  recipientPhone,
  buttonname
) {
  await Whatsapp.sendRadioButtons({
    recipientPhone,
    headerText: 'AutoWhat ChatBot',
    bodyText: message,
    footerText: '© 2023 AutoWhat ChatBot',
    listOfSections,
    buttonname,
  });
}

async function sendDocument({ caption, recipientPhone, file_path }) {
  try {
    const mediaId = await uploadMedia(file_path.split('/').at(-1));

    if (mediaId) {
      const obj = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'document',
        document: {
          id: mediaId,
          caption,
        },
      };

      await delay(100);

      return await WHATSAPP_API.post('/messages', obj);
    }
  } catch (err) {
    console.error(err?.response?.data, 'error');
    // return await Whatsapp.sendText({
    //   message: "Errro in sending document",
    //   recipientPhone,
    // });
  }
}

async function sendLocation({
  recipientPhone,
  latitude,
  longitude,
  name,
  address,
}) {
  await Whatsapp.sendLocation({
    recipientPhone,
    latitude,
    longitude,
    name,
    address,
  });
}

async function sendImage({ caption, file_path, url, recipientPhone }) {
  await Whatsapp.sendImage({
    recipientPhone,
    caption,
    file_path,
    url,
  });
}

async function sendVideo({ caption, file_path, url, recipientPhone }) {
  await Whatsapp.sendVideo({
    recipientPhone,
    caption,
    file_path,
    url,
  });
}

async function sendLocationCta({ message, recipientPhone }) {
  const obj = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'INTERACTIVE',
    interactive: {
      type: 'location_request_message',
      body: {
        text: message,
      },
      action: {
        name: 'send_location',
      },
    },
  };

  await WHATSAPP_API.post('/messages', obj);
}

async function sendCtaUrlButton({ buttonName, url, message, recipientPhone }) {
  const obj = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'INTERACTIVE',
    interactive: {
      type: 'cta_url',
      body: {
        text: message,
      },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: buttonName,
          url: url,
        },
      },
    },
  };

  await WHATSAPP_API.post('/messages', obj);
}

function createFlow(
  header,
  body,
  footer,
  flow_id,
  flow_cta,
  flow_token,
  flow_data,
  draft,
  recipientPhone
) {
  const flowObj = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'text',
        text: header ?? 'Hi',
      },
      body: {
        text: body ?? 'Body',
      },
      footer: {
        text: footer ?? '©Autowhat',
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token,
          flow_id,
          flow_cta,
          flow_action: 'data_exchange',
        },
      },
    },
  };

  if (draft) {
    flowObj.interactive.action.parameters.mode = 'draft';
  }

  if (flow_data) {
    const payload = {
      data: flow_data.data,
    };

    if (flow_data.screen) {
      payload.screen = flow_data.screen;
      flowObj.interactive.action.parameters.flow_action = 'navigate';
    } else {
      flowObj.interactive.action.parameters.flow_action = 'data_exchange';
    }

    flowObj.interactive.action.parameters['flow_action_payload'] = payload;
  }

  console.log('[createFlow] Final Flow Object:', JSON.stringify(flowObj, null, 2));

  return flowObj;
}


function createFlowData(screenName, screenData) {
  return {
    screen: screenName,
    data: screenData,
  };
}

async function sendFlow({
  header,
  body,
  footer,
  flow_id,
  flow_cta,
  flow_token,
  flow_data,
  draft,
  recipientPhone,
}) {
  try {
    const flowObj = createFlow(
      header,
      body,
      footer,
      flow_id,
      flow_cta,
      flow_token,
      flow_data,
      draft,
      recipientPhone
    );

    // Log flow_id being sent
    console.log(`[FLOW DEBUG] Sending flow with flow_id: ${flow_id}, recipient: ${recipientPhone}, flow_cta: ${flow_cta}`);
    await WHATSAPP_API.post('/messages', flowObj);
    console.log(`[FLOW DEBUG] Successfully sent flow_id: ${flow_id}`);
  } catch (err) {
    // Find flow name from flow_id for easier debugging
    const flowName = Object.keys(FLOW_CREDS).find(key => FLOW_CREDS[key] === flow_id) || 'Unknown';

    // Enhanced error logging to identify the problematic flow_id
    console.error('='.repeat(60));
    console.error(`[FLOW ERROR] ❌ FAILED TO SEND FLOW`);
    console.error(`[FLOW ERROR] flow_id: ${flow_id}`);
    console.error(`[FLOW ERROR] flow_name: ${flowName}`);
    console.error(`[FLOW ERROR] recipient: ${recipientPhone}`);
    console.error(`[FLOW ERROR] flow_cta: ${flow_cta}`);
    console.error(`[FLOW ERROR] Error details:`, err.response?.data || err.message);
    console.error('='.repeat(60));
    if (err.response?.data) {
      console.error(err.response.data);
    } else {
      console.error(err);
    }
  }
}

export function createTemplate(
  templateName,
  recipientPhone,
  { bodyComponent, headerComponent, components, language } = {}
) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: language ?? 'en_US',
      },
      components: [
        ...(bodyComponent ?? []),
        ...(headerComponent ?? []),
        ...(components ?? []),
      ],
    },
  };
}

function createComponent(componentName, parameters) {
  return [
    {
      type: componentName,
      parameters: [...(parameters ?? {})],
    },
  ];
}

function createButtonComponent(index, subType, parameters) {
  return {
    type: 'button',
    sub_type: subType,
    index: index,
    parameters: [...parameters],
  };
}

function createPayload(payload) {
  return [
    {
      type: 'payload',
      payload,
    },
  ];
}

async function sendEmployeeDemoTemplate(messageOne, recipientPhone) {
  try {
    const headerParamters = [
      {
        type: 'image',
        image: {
          link: 'https://i.ibb.co/r7H5pPk/Copy-of-Copy-of-Cut-Costs-by-Over-Rs-15000-Monthly-with-Attendance-Tracking-2.png',
        },
      },
    ];
    const bodyParameters = [
      {
        type: 'text',
        text: ` *${messageOne}* `,
      },
    ];

    const headerComponent = createComponent('header', headerParamters);
    const bodyComponent = createComponent('body', bodyParameters);

    const buttonDirectStart = createButtonComponent(
      '0',
      'quick_reply',
      createPayload('directStart')
    );

    const templateObj = createTemplate('employee_signup', recipientPhone, {
      bodyComponent,
      headerComponent,
      components: [buttonDirectStart],
      // components: [buttonStartDemo, buttonDirectStart, buttonDontWork],
    });

    const res = await WHATSAPP_API.post('/messages', templateObj);
    console.log(res.data, recipientPhone, messageOne)
  } catch (err) {
    console.error(err.response.data)
  }
}

async function sendActivateSessionTemplate(recipientPhone) {
  try {
    // const headerParamters = [
    //   {
    //     type: 'image',
    //     image: {
    //       link: 'https://i.ibb.co/r7H5pPk/Copy-of-Copy-of-Cut-Costs-by-Over-Rs-15000-Monthly-with-Attendance-Tracking-2.png',
    //     },
    //   },
    // ];
    // const headerComponent = createComponent('header', headerParamters);

    const buttonActivateSession = createButtonComponent(
      '0',
      'quick_reply',
      createPayload('activateSession')
    );
    const template = createTemplate('daily_activate_session', recipientPhone, {
      // headerComponent,
      components: [buttonActivateSession],
      language: 'en_US',
    });

    console.log(JSON.stringify(template));

    return await WHATSAPP_API.post('/messages', template);

    // const messageId = res?.data?.messages?.[0]?.id;

    // return messageId;
  } catch (err) {
    console.error(err);
  }
}

async function sendActivateSessionTemplateWithReport(
  message,
  recipientPhone,
  absentEmployees,
  id,
  fileName
) {
  const templates = [
    {
      count: 3,
      name: 'daily_live_report_with_absent_employees_3',
    },
    {
      count: 5,
      name: 'daily_live_report_with_absent_employees_5',
    },
    {
      count: 7,
      name: 'daily_live_report_with_absent_employees_7',
    },
    {
      count: 10,
      name: 'daily_live_report_with_absent_employees_10',
    },
    {
      count: 14,
      name: 'daily_live_report_with_absent_employees_14',
    },
    {
      count: 17,
      name: 'daily_live_report_with_absent_employees_17',
    },
    {
      count: 20,
      name: 'daily_live_report_with_absent_employees_20',
    },
  ];

  // const buttonActivateSession = createButtonComponent(
  //   '0',
  //   'quick_reply',
  //   createPayload('activateSession')
  // );

  const bodyParameters = [];

  const headerParameters = [
    {
      type: 'document',
      document: {
        id,
        filename: fileName,
      },
    },
  ];

  let templateName = templates.at(-1);

  if (absentEmployees.length < 20) {
    templateName = templates.find(
      (template) => absentEmployees.length <= template.count
    );
  }

  if (absentEmployees.length === 0) {
    Array.from('...').forEach((_) => {
      bodyParameters.push({
        type: 'text',
        text: '.',
      });
    });
  } else {
    for (let i = 0; i < 20; i++) {
      bodyParameters.push({
        type: 'text',
        text: absentEmployees[i] ?? '.',
      });
    }
  }

  const headerComponent = createComponent('header', headerParameters);
  const bodyComponent = createComponent(
    'body',
    bodyParameters.slice(0, templateName.count)
  );

  const template = createTemplate(templateName.name, recipientPhone, {
    bodyComponent,
    headerComponent,
    components: [],
    language: 'en'
  });

  return await WHATSAPP_API.post('/messages', template);
}

async function sendLanguageFlow(messageId, recipientPhone, dynamicData = {}) {
  const message = getTextMessage('English', messageId, [], 'main');

  const { flowBody, flow } = getFlowMessageData(message);

  const flowData = {
    screen: 'Language',
    data: {
      ...flow,
      userData: dynamicData,
      init_values: {
        userData: dynamicData,
      },
    },
  };

  await sendFlow({
    body: flowBody,
    flow_cta: 'Select Language',
    flow_data: flowData,
    flow_id: LANGUAGES_FLOW_ID,
    flow_token: LANGUAGES_FLOW_TOKEN,
    recipientPhone,
  });
}

async function sendCheckInReminderTemplate(recipientPhone, employeeName) {
  try {
    const checkInButton = createButtonComponent(
      '0',
      'quick_reply',
      createPayload('check_in')
    );

    const bodyParameters = [
      {
        type: 'text',
        text: employeeName,
      },
      {
        type: 'text',
        text: 'IN',
      },
    ];

    const bodyComponent = createComponent('body', bodyParameters);
    const template = createTemplate('check_in_reminder', recipientPhone, {
      bodyComponent,
      components: [checkInButton],
      language: 'en',
    });

    return await WHATSAPP_API.post('/messages', template);
  } catch (err) {
    console.error(err.response.data);
  }
}

async function sendImageWithActionAttendanceNotificationTemplate(
  recipientPhone,
  employeeName,
  address,
  url,
  id
) {
  try {
    const fulldayButton = createButtonComponent(
      '0',
      'quick_reply',
      createPayload(`full-day@${id}`)
    );
    const halfdayButton = createButtonComponent(
      '1',
      'quick_reply',
      createPayload(`half-day@${id}`)
    );
    const absentButton = createButtonComponent(
      '2',
      'quick_reply',
      createPayload(`absent@${id}`)
    );

    const bodyParameters = [
      {
        type: 'text',
        text: employeeName,
      },
      {
        type: 'text',
        text: address,
      },
    ];

    const headerParameters = [
      {
        type: 'image',
        image: {
          link: url,
        },
      },
    ];

    const headerComponent = createComponent('header', headerParameters);

    const bodyComponent = createComponent('body', bodyParameters);
    const template = createTemplate(
      'image_attendance_notification',
      recipientPhone,
      {
        bodyComponent,
        headerComponent,
        components: [fulldayButton, halfdayButton, absentButton],
      }
    );


    return await WHATSAPP_API.post('/messages', template);
  } catch (err) {
    console.error(err.response.data);
  }
}

async function sendImageAttendanceNotificationTemplate(
  recipientPhone,
  employeeName,
  address,
  url
) {
  try {
    const bodyParameters = [
      {
        type: 'text',
        text: employeeName,
      },
      {
        type: 'text',
        text: address,
      },
    ];

    const headerParameters = [
      {
        type: 'image',
        image: {
          link: url,
        },
      },
    ];

    const headerComponent = createComponent('header', headerParameters);

    const bodyComponent = createComponent('body', bodyParameters);
    const template = createTemplate(
      'image_attendance_notification_2',
      recipientPhone,
      {
        bodyComponent,
        headerComponent,
        components: [],
      }
    );

    return await WHATSAPP_API.post('/messages', template);
  } catch (err) {
    console.error(err.response.data);
  }
}

// sendImageWithActionAttendanceNotificationTemplate(
//   '919826000000',
//   'John Doe',
//   '123 Main St, Anytown, USA',
//   'https://example.com/image.jpg',
//   '1234567890'
// );

export {
  sendTextMessage,
  sendSimpleButtonsWithImage,
  sendSimpleButtons,
  sendRadioButtons,
  sendDocument,
  sendLocation,
  sendImage,
  sendVideo,
  sendLocationCta,
  sendCtaUrlButton,
  sendFlow,
  sendImageWithActionAttendanceNotificationTemplate,
  sendImageAttendanceNotificationTemplate,
  sendEmployeeDemoTemplate,
  sendActivateSessionTemplate,
  sendActivateSessionTemplateWithReport,
  createFlowData,
  sendLanguageFlow,
  sendCheckInReminderTemplate,
};

