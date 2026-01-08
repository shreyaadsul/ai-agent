import { sendMail } from "./logger.js";
// import { sendTextMessage } from "./messages.js";

function tryCatch(controllerFunction) {
  return async (...args) => {
    try {
      return await controllerFunction(...args);
    } catch (error) {
      try {
        // ? message is incoming whatsapp message
        const [message, session] = args;

        let recipientPhone = "";
        let user;

        if (args[0].session && args[0].recipientPhone) {
          recipientPhone = args[0].recipientPhone;
          user = args[0].session.get(recipientPhone);
        } else {
          recipientPhone = Number(message?.message?.from?.phone);
        }

        const subject = `Error in Attendance ${error.message}`;

        const stackTrace = error.stack ?? error.error;
        const recipientName = message?.message?.from?.name;

        if (session instanceof Map) {
          user = session?.get(recipientPhone);
        }

        const mailBody = `Error: ${error.message
          }\nname: ${recipientName},\n phone: ${recipientPhone}\n\nsession: ${JSON.stringify(
            user,
            null,
            2
          )}\n\nstack trace: ${stackTrace}`;

        console.error("An Error Occured", error);
        // await sendTextMessage(error.message, recipientPhone);
        await sendMail(subject, mailBody)
      } catch (error) {
        console.error(error);
      }
    }
  };
}

export { tryCatch };
