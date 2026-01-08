// import Redis from '../lib/redis.js';
// import { DAY_IN_SECS } from './constants.js';
// import {
//   sendActivateSessionTemplate,
//   sendActivateSessionTemplateWithReport,
//   sendDocument,
// } from './messages.js';
// import { uploadMedia } from './utils.js';

export const failedMessageHandler = async (recipientPhone, errorCode) => {
  const key = `${recipientPhone}:notification`;
  // const messageInfoObj = await Redis.hGetAll(key);

  // if (!messageInfoObj) {
  //   return;
  // }

  // const retries = Number(messageInfoObj.try);

  // if (messageInfoObj.type === 'activate_session' && retries <= 2) {
  // setTimeout(async () => {
  //   // const messageId = await sendActivateSessionTemplate(recipientPhone);
  //   const resp = await sendActivateSessionTemplate(recipientPhone);
  //   const messageId = resp?.data?.messages?.[0]?.id;
  //   if (messageId) {
  //     await Redis.hmset(
  //       key,
  //       {
  //         type: 'activate_session',
  //         messageId,
  //         try: String(retries + 1),
  //       },
  //       DAY_IN_SECS
  //     );
  //   }
  // }, 8000 * retries);
  // } else if (messageInfoObj.type === 'daily_live_report' && retries <= 2) {
  // setTimeout(async () => {
  //   let messageId = '';
  //   if (errorCode === 131049 || errorCode === 131047) {
  //     const mediaId = await uploadMedia(`${recipientPhone}-liveReport.pdf`);
  //     if (mediaId) {
  //       const res = await sendActivateSessionTemplateWithReport(
  //         'Live Report',
  //         recipientPhone,
  //         mediaId,
  //         'Live Report.pdf'
  //       );
  //       messageId = res?.data?.messages?.[0]?.id;
  //     }
  //   } else {
  //     messageId = await sendDocument({
  //       recipientPhone: recipientPhone,
  //       file_path: `${process.env.ROOT_PATH}/${recipientPhone}-liveReport.pdf`,
  //       caption: 'Live Report',
  //     });
  //   }
  //   if (messageId) {
  //     await Redis.hmset(
  //       key,
  //       {
  //         type: 'daily_live_report',
  //         messageId,
  //         try: String(retries + 1),
  //       },
  //       DAY_IN_SECS
  //     );
  //   }
  // }, 8000 * retries);
  // } else if (messageInfoObj.type === 'check_in_reminder' && retries <= 2) {
  //
  // }
};

// async function isSessionTemplateSentToUser(phone) {
//   const data = await Redis.get(phone);

//   if (data && data.isTemplateSent) {
//     return true;
//   }

//   return false;
// }
