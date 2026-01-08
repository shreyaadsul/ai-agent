import WhatsappCloudAPI from 'whatsappcloudapi_wrapper';
import path from 'path';
import fs from 'fs/promises';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { ObjectId } from 'mongodb';
import { existsSync } from 'fs';
import axios from 'axios';

import {
    handleTextMessage,
    handleSimpleButtonMessage,
    handleRadioButtonMessage,
    handleLocationMessage,
    handleMediaMessage,
    handleFlowMessage,
    handleContactMessage,
    handleQuickReplyMessage,
} from '../msgHandlers/index.js';

import { SIGN_UP_FLOW_ID, SIGN_UP_FLOW_TOKEN } from '../utils/constants.js';
import {
    sendFlow,
    sendDocument,
    sendVideo,
    sendLocationCta,
    sendLanguageFlow,
    sendImage,
    sendTextMessage,
    sendSimpleButtons,
    sendImageAttendanceNotificationTemplate,
    sendImageWithActionAttendanceNotificationTemplate,
    setWhatsappInstance,
} from '../utils/messages.js';
import { getTextMessage, getSimpleButtonsMessage } from '../utils/languages.js';
import {
    getTimeZone,
    getMediaUrl,
    isCheckIn,
    downloadAndSave,
    markAttendance,
    delay,
    uploadMedia,
} from '../utils/utils.js';

import {
    Employer,
    Employee,
    CoownerLogs,
    OwnerTransferLogs,
} from '../models/index.js';

import { uploadFileToBucket, uploadToBucket } from '../utils/bucket.js';
import { tryCatch } from '../utils/tryCatch.js';

import session from '../lib/session.js';
import { notificationMessageHandler } from '../utils/notification_message_handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootPath = path.dirname(__dirname);

export const Whatsapp = new WhatsappCloudAPI({
    accessToken: process.env.Meta_WA_accessToken,
    senderPhoneNumberId: process.env.Meta_WA_SenderPhoneNumberId,
    WABA_ID: process.env.Meta_WA_wabaId,
});

setWhatsappInstance(Whatsapp);

const ONE_HOUR_IN_MS = 3600 * 1000;

const messageHandler = {
    text_message: (msg, recipientPhone, session) =>
        handleTextMessage({
            message: msg.text.body,
            recipientPhone,
            session,
            incomingMessage: msg,
        }),
    simple_button_message: (msg, recipientPhone, session) =>
        handleSimpleButtonMessage({
            buttonId: msg.button_reply.id,
            session,
            recipientPhone,
        }),
    radio_button_message: (msg, recipientPhone, session) =>
        handleRadioButtonMessage({
            buttonId: msg.list_reply.id,
            session,
            recipientPhone,
        }),
    location_message: (msg, recipientPhone, session) =>
        handleLocationMessage({
            incomingMessage: msg,
            recipientPhone,
            session,
        }),
    media_message: (msg, recipientPhone, session) =>
        handleMediaMessage({
            media: msg,
            recipientPhone,
            session,
        }),
    contact_message: (msg, recipientPhone, session) => {
        handleContactMessage({ contacts: msg.contacts, recipientPhone, session });
    },
    nfm_reply: async (flowMessage, recipientPhone, session) => {
        try {
            console.log(`[FLOW HANDLER] Processing flow response for ${recipientPhone}`);
            await handleFlowMessage({ flowMessage, recipientPhone, session });
        } catch (error) {
            console.error(`[FLOW HANDLER ERROR] Error in flow handling: ${error.message}`);
            console.error(error.stack);
        }
    },
    quick_reply_message: async (message, recipientPhone, session) => {
        handleQuickReplyMessage({ message, recipientPhone, session });
    },
    interactive: async (msg, recipientPhone, session) => {
        if (msg.interactive.type === 'button_reply') {
            await handleSimpleButtonMessage({
                buttonId: msg.interactive.button_reply.id,
                session,
                recipientPhone,
            });
        } else if (msg.interactive.type === 'list_reply') {
            await handleRadioButtonMessage({
                buttonId: msg.interactive.list_reply.id,
                session,
                recipientPhone,
            });
        }
    },
};

export const whatsappMessageController = async (req, res) => {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('[WEBHOOK] ⚡ POST request received at /attendance_callbackurl');
        console.log('[WEBHOOK] Timestamp:', new Date().toISOString());

        // Log WABA ID Debug Info
        const incomingWabaId = req.body?.entry?.[0]?.id;
        console.log(`[WEBHOOK] Incoming WABA_ID: ${incomingWabaId}`);
        console.log(`[WEBHOOK] Configured WABA_ID (in env): ${process.env.Meta_WA_wabaId}`);

        console.log('[WEBHOOK] Request body keys:', Object.keys(req.body || {}));
        console.log('[WEBHOOK] Request body sample:', JSON.stringify(req.body).substring(0, 300));

        if (req.body?.entry?.[0]?.changes?.[0]?.value?.statuses) {
            console.log('[WEBHOOK] 📉 Received status update (sent/delivered/read) - Ignoring');
            return res.sendStatus(200);
        }

        const DynamicWhatsapp = new WhatsappCloudAPI({
            accessToken: process.env.Meta_WA_accessToken,
            senderPhoneNumberId: process.env.Meta_WA_SenderPhoneNumberId,
            WABA_ID: incomingWabaId,
        });

        // Check for system events like flow endpoint availability
        if (req.body?.entry?.[0]?.changes?.[0]?.value?.event) {
            console.log(`[WEBHOOK] ⚠️ Received system event: ${req.body.entry[0].changes[0].value.event}`);
            return res.sendStatus(200);
        }

        const message = DynamicWhatsapp.parseMessage(req.body);
        // const message = req.body;

        console.log('[WEBHOOK] ✅ Message parsed successfully');
        console.log('[WEBHOOK] isMessage:', message?.isMessage);
        console.log('[WEBHOOK] Message type:', message?.message?.type || 'unknown');
        // console.log('[WEBHOOK] Full message object:', JSON.stringify(message, null, 2).substring(0, 500));

        if (message.isMessage === false) {
            notificationMessageHandler(message.notificationMessage);
        }

        if (isMessage(message)) {
            const {
                incomingMessage,
                recipientName,
                recipientPhone,
                typeOfMsg,
                message_id,
                timestamp,
            } = parseMessage(message.message);

            if (isMessageRecent(timestamp)) {
                const isRegistered = await isRecipientRegistered(
                    recipientPhone,
                    session
                );

                console.log('[WEBHOOK] 👤 User registration status:', isRegistered);

                logMessageToCSV(message.message);
                console.log('[WEBHOOK] 📝 Message logged to CSV');

                if (!session.has(recipientPhone)) {
                    console.log('[WEBHOOK] 🆕 New user session created for:', recipientPhone);
                    session.set(recipientPhone, {
                        isRegistered: false,
                    });
                } else {
                    console.log('[WEBHOOK] ♻️ Existing session found for:', recipientPhone);
                }

                const userSession = session.get(recipientPhone);

                // --- STRICT DEDUPLICATION ---
                // Ensure processedMessageIds is an array to survive JSON serialization
                let processedIds = userSession.processedMessageIds;
                if (!Array.isArray(processedIds)) {
                    processedIds = [];
                }

                if (processedIds.includes(message_id)) {
                    console.log(`[WEBHOOK] 🛑 Duplicate message_id detected: ${message_id}. Ignoring.`);
                    return res.sendStatus(200);
                }

                // Add to processed IDs and keep size manageable (e.g., last 10)
                processedIds.push(message_id);
                if (processedIds.length > 10) {
                    processedIds.shift();
                }
                userSession.processedMessageIds = processedIds;

                // Persist session changes
                session.set(recipientPhone, userSession);

                // Update timestamps
                userSession.lastMessageTimestamp = timestamp;

                const callBack = tryCatch(async () => {
                    if (isRegistered) {
                        /*
                        if (recipientPhone === 918657854260) {
                            return await axios.post('https://uninvective-incorrigibly-warren.ngrok-free.dev ', message)
                        }
                        */

                        if (messageHandler[typeOfMsg]) {
                            await messageHandler[typeOfMsg](
                                incomingMessage,
                                recipientPhone,
                                session
                            );
                        } else if (incomingMessage.interactive?.type === 'nfm_reply') {
                            await messageHandler[incomingMessage.interactive.type](
                                incomingMessage.interactive.nfm_reply.response_json,
                                recipientPhone,
                                session
                            );
                        } else if (
                            incomingMessage.document &&
                            incomingMessage.document.filename
                        ) {
                            if (session.get(recipientPhone).session === 'broadcast') {
                                const broadcastMessage =
                                    session.get(recipientPhone).broadcastMessage;
                                const employees = session.get(recipientPhone).employees;

                                const mediaUrl = await getMediaUrl(incomingMessage.document.id);

                                const fileName = incomingMessage.document.filename;
                                const isSaved = await downloadAndSave(mediaUrl, fileName);

                                if (isSaved) {
                                    await Promise.allSettled(
                                        employees.map((employee) => {
                                            return sendDocument({
                                                caption: broadcastMessage,
                                                file_path: path.join(process.env.ROOT_PATH, fileName),
                                                recipientPhone: employee,
                                            });
                                        })
                                    );
                                }

                                const message = getTextMessage(
                                    session.get(recipientPhone).user.language,
                                    'broadcasted',
                                    [],
                                    'main'
                                );

                                await sendTextMessage(message, recipientPhone);
                                session.delete(recipientPhone);
                            } else {
                                const mediaUrl = await getMediaUrl(incomingMessage.document.id);

                                if (mediaUrl) {
                                    const response = await uploadToBucket(
                                        mediaUrl,
                                        incomingMessage.document.filename
                                    );

                                    if (response.status === 'success') {
                                        const checkedIn = await isCheckIn(
                                            session.get(recipientPhone).user
                                        );

                                        if (checkedIn.attendance) {
                                            const { message, listOfButtons } =
                                                getSimpleButtonsMessage(
                                                    session.get(recipientPhone)?.user?.language,
                                                    'addToLogs',
                                                    [],
                                                    'main'
                                                );

                                            await sendSimpleButtons(
                                                message,
                                                listOfButtons(checkedIn.attendance._id.toString()),
                                                recipientPhone
                                            );
                                            session.get(recipientPhone).logDocUrl = response.url;
                                        }
                                    }
                                }
                            }
                        } else if (incomingMessage.video && incomingMessage.video.id) {
                            if (session.get(recipientPhone).session === 'broadcast') {
                                const broadcastMessage =
                                    session.get(recipientPhone).broadcastMessage;
                                const employees = session.get(recipientPhone).employees;

                                const mediaUrl = await getMediaUrl(incomingMessage.video.id);
                                const fileName = `${incomingMessage.video.id}-${recipientPhone}.mp4`;

                                const isSaved = await downloadAndSave(mediaUrl, fileName);

                                if (isSaved) {
                                    await Promise.allSettled(
                                        employees.map((employee) => {
                                            return sendVideo({
                                                caption: broadcastMessage,
                                                file_path: path.join(process.env.ROOT_PATH, fileName),
                                                recipientPhone: employee,
                                            });
                                        })
                                    );
                                    const message = getTextMessage(
                                        session.get(recipientPhone).user.language,
                                        'broadcasted',
                                        [],
                                        'main'
                                    );

                                    await sendTextMessage(message, recipientPhone);
                                    session.delete(recipientPhone);
                                }
                            }
                        } else {
                            await sendTextMessage(
                                "Please Type 'Hi' to Start",
                                recipientPhone
                            );
                        }
                    } else {
                        /*
                        if (recipientPhone === 918657854260) {
                            return await axios.post(
                                'https://uninvective-incorrigibly-warren.ngrok-free.dev ',
                                req.body
                            );
                        }
                        */

                        const language =
                            session.get(recipientPhone)?.selectedLanguage?.type ?? 'English';

                        if (typeOfMsg === 'text_message') {
                            const { message, listOfButtons } = getSimpleButtonsMessage(
                                'English',
                                'newUser',
                                [],
                                'main'
                            );
                            console.log(`[WEBHOOK] 📤 Sending Welcome Menu (newUser) to ${recipientPhone}`);
                            await sendSimpleButtons(message, listOfButtons, String(recipientPhone));
                            console.log('[WEBHOOK] ✅ Welcome Menu sent successfully.');
                        } else if (typeOfMsg === 'simple_button_message') {
                            const buttonId = incomingMessage.button_reply.id;

                            if (buttonId === 'signup') {
                                await sendSignupFlow(language, recipientPhone);
                            } else if (buttonId === 'startSignup') {
                                const { message, listOfButtons } = getSimpleButtonsMessage(
                                    'English',
                                    buttonId,
                                    [],
                                    'main'
                                );
                                await sendSimpleButtons(message, listOfButtons, recipientPhone);
                            } else if (
                                buttonId === 'singlelanguage' ||
                                buttonId === 'duallanguage'
                            ) {
                                await sendLanguageFlow(buttonId, recipientPhone, '');
                            } else if (buttonId.startsWith('addCoOwn')) {
                                const [
                                    ,
                                    action,
                                    employeeId,
                                    employerNumber,
                                    employeeName,
                                    logId,
                                ] = buttonId.split('@');

                                const user = session.get(recipientPhone)?.user;
                                let employer = session.get(employerNumber)?.user;

                                if (!employer) {
                                    employer = await Employer.findOne({
                                        employerNumber: Number(employerNumber),
                                    });
                                    session.set(employerNumber, {
                                        user: {
                                            ...employer._doc,
                                            companyId: employer._id.toString(),
                                        },
                                    });
                                    employer = session.get(employerNumber).user;
                                }

                                if (action === 'accept') {
                                    if (employeeId == 'undefined') {
                                        const employee = await Employee.create({
                                            employeeNumber: Number(recipientPhone),
                                            employeeName: employeeName,
                                            employerNumber: Number(employerNumber),
                                            companyId: employer.companyId,
                                            companyName: employer.companyName,
                                            role: 'coowner',
                                            checkIn: new Date(1970, 0, 1, 9, 30),
                                            checkOut: new Date(1970, 0, 1, 18, 30),
                                            requiredHours: new Date(1970, 0, 1, 9, 0),
                                        });

                                        if (employee) {
                                            let message = getTextMessage(
                                                employer.language,
                                                'coOwnerSuccess',
                                                [employeeName]
                                            );
                                            await sendTextMessage(message, employerNumber);
                                            message = getTextMessage('English', 'coownerAccepted');
                                            await sendTextMessage(message, recipientPhone);

                                            await CoownerLogs.findByIdAndUpdate(logId, {
                                                'to.updatedAt': new Date(),
                                                status: 'accepted',
                                            });
                                        }
                                    } else {
                                        const res = await Employee.updateOne(
                                            { _id: employeeId },
                                            {
                                                role: 'coowner',
                                            }
                                        );

                                        if (res && res.acknowledged) {
                                            let message = getTextMessage(
                                                employer.language,
                                                'coOwnerSuccess',
                                                [user.employeeName]
                                            );
                                            await sendTextMessage(message, employerNumber);
                                            message = getTextMessage('English', 'coownerAccepted');
                                            await sendTextMessage(message, recipientPhone);

                                            await CoownerLogs.findByIdAndUpdate(logId, {
                                                'to.updatedAt': new Date(),
                                                status: 'accepted',
                                            });
                                        }
                                    }
                                } else if (action === 'reject') {
                                    const transferLog = await CoownerLogs.findOne({
                                        _id: logId,
                                        status: 'pending',
                                    });

                                    if (transferLog) {
                                        await transferLog.updateOne({ status: 'rejected' });

                                        let message = getTextMessage(
                                            user?.language,
                                            'coownerRejected'
                                        );
                                        await sendTextMessage(message, recipientPhone);
                                        message = getTextMessage(
                                            employer.language,
                                            'addCoOwnRejected',
                                            [employeeName]
                                        );
                                        await sendTextMessage(message, employerNumber);
                                    } else {
                                        const message = getTextMessage(user?.language, 'noAction');
                                        await sendTextMessage(message, recipientPhone);
                                    }
                                }

                                session.delete(recipientPhone);
                                session.delete(employerNumber);
                            }
                            if (buttonId.startsWith('addOwn')) {
                                const [
                                    ,
                                    action,
                                    employeeId,
                                    logId,
                                    employerNumber,
                                    language,
                                    employeeName,
                                ] = buttonId.split('@');

                                if (action === 'accept') {
                                    if (employeeId == 'undefined') {
                                        const newOwner = await Employer.updateOne(
                                            { employerNumber: Number(employerNumber) },
                                            {
                                                employerNumber: recipientPhone,
                                                fullName: employeeName,
                                                language: 'English',
                                            }
                                        );

                                        if (newOwner) {
                                            const update = await Employee.updateMany(
                                                { companyId: newOwner.companyId },
                                                { employerNumber: recipientPhone }
                                            );

                                            if (update && update.acknowledged) {
                                                let message = getTextMessage(
                                                    newOwner.language,
                                                    'ownerRemoved',
                                                    [employeeName]
                                                );
                                                await sendTextMessage(message, employerNumber);
                                                message = getTextMessage('English', 'newOwnerSuccess', [
                                                    newOwner.companyName,
                                                ]);
                                                await sendTextMessage(message, recipientPhone);

                                                await OwnerTransferLogs.updateOne(
                                                    { _id: logId },
                                                    {
                                                        'to.updatedAt': moment.tz(
                                                            new Date(),
                                                            newOwner.timeZone
                                                        ),
                                                        status: 'accepted',
                                                    }
                                                );
                                            }
                                        }
                                    } else {
                                        const employee = await Employee.findByIdAndDelete(
                                            employeeId
                                        );

                                        if (employee) {
                                            const owner = await Employer.findByIdAndUpdate(
                                                employee.companyId,
                                                {
                                                    employerNumber: recipientPhone,
                                                    fullName: employee.employeeName,
                                                }
                                            );

                                            if (owner) {
                                                const update = await Employee.updateMany(
                                                    { companyId: owner.companyId },
                                                    { employerNumber: recipientPhone }
                                                );

                                                if (update.acknowledged) {
                                                    let message = getTextMessage(
                                                        owner.language,
                                                        'ownerSuccess',
                                                        [employee.employeeName]
                                                    );
                                                    await sendTextMessage(message, employerNumber);

                                                    message = getTextMessage(
                                                        language,
                                                        'newOwnerSuccess',
                                                        [owner.companyName]
                                                    );
                                                    await sendTextMessage(message, recipientPhone);

                                                    await OwnerTransferLogs.findByIdAndUpdate(logId, {
                                                        'to.updatedAt': moment.tz(
                                                            new Date(),
                                                            owner.timeZone
                                                        ),
                                                        status: 'accepted',
                                                    });
                                                }
                                            }
                                        }

                                        session.delete(recipientPhone);
                                        session.delete(employerNumber);
                                    }
                                } else if (action === 'reject') {
                                    const transferLog = await OwnerTransferLogs.findOne({
                                        _id: logId,
                                        status: 'pending',
                                    });

                                    if (transferLog) {
                                        await transferLog.updateOne({ status: 'rejected' });

                                        let message = getTextMessage(language, 'addOwnCancelled');
                                        await sendTextMessage(message, recipientPhone);

                                        let employerLanguage =
                                            session.get(employerNumber)?.user?.language;

                                        if (!employerLanguage) {
                                            const employer = await Employer.findOne(
                                                { employerNumber },
                                                { language: 1 }
                                            );
                                            employerLanguage = employer.language;
                                        }

                                        message = getTextMessage(
                                            employerLanguage,
                                            'addOwnRejected',
                                            [employeeName]
                                        );
                                        await sendTextMessage(message, employerNumber);
                                    } else {
                                        const message = getTextMessage(language, 'addOwnCancelled');
                                        await sendTextMessage(message, recipientPhone);
                                    }
                                }

                                session.delete(recipientPhone);
                                session.delete(Number(employerNumber));
                            }
                        } else if (typeOfMsg === 'location_message') {
                            const { latitude, longitude } = incomingMessage.location;

                            updateUserSession(
                                {
                                    location: {
                                        lat: latitude,
                                        long: longitude,
                                        clicked: true,
                                        time: new Date().getTime(),
                                    },
                                },
                                session,
                                recipientPhone
                            );

                            if (session.get(recipientPhone).session === 'timezoneLocation') {
                                await sendSignupFlow(language, recipientPhone);

                                updateUserSession({ session: '' }, session, recipientPhone);

                                return;
                            }
                        } else if (incomingMessage.interactive?.type === 'nfm_reply') {
                            const flowMessage = JSON.parse(
                                incomingMessage.interactive.nfm_reply.response_json
                            );
                            const flowName = flowMessage?.flowName;

                            if (flowName === 'signUp') {
                                const { fullName, companyName } = flowMessage;

                                const bufferTime = Number(flowMessage.bufferTime) ?? 15;

                                const { location } = session.get(recipientPhone);
                                let timezoneInfo = {};

                                if (location && location.lat && location.long) {
                                    timezoneInfo = await getTimeZone(
                                        location.lat,
                                        location.long,
                                        recipientPhone
                                    );
                                }

                                await Employer.create({
                                    fullName: fullName.trim(),
                                    employeeNumber: recipientPhone,
                                    companyName: companyName.trim(),
                                    bufferTime: bufferTime || '15',
                                    employerNumber: recipientPhone,
                                    registeredOn: new Date().getTime(),
                                    language,
                                    countryName: timezoneInfo?.countryName,
                                    countryCode: timezoneInfo?.countryCode,
                                    timeZone: timezoneInfo?.timeZone,
                                    regionName: timezoneInfo?.regionName,
                                    notifications: {},
                                });

                                const { message, listOfButtons } = getSimpleButtonsMessage(
                                    language,
                                    'addGeo-fencing-emplyer',
                                    [],
                                    'main'
                                );

                                await sendSimpleButtons(message, listOfButtons, recipientPhone);
                                session.delete(recipientPhone);
                            } else if (flowName === 'languages') {
                                const { language } = flowMessage;

                                updateUserSession(
                                    {
                                        session: 'timezoneLocation',
                                        selectedLanguage: { type: language },
                                    },
                                    session,
                                    recipientPhone
                                );

                                const message = getTextMessage(
                                    language,
                                    'timezoneLocation',
                                    [],
                                    'main'
                                );
                                await sendLocationCta({ message, recipientPhone });
                            }
                        } else if (typeOfMsg === 'quick_reply_message') {
                            const button = message.message?.button?.payload;

                            if (button === 'brochure') {
                                await sendDocument({
                                    file_path: path.join(rootPath, '/public/brochure.pdf'),
                                    caption: 'Attendance Bot Brochure',
                                    recipientPhone,
                                });

                                // await Marketing.create({
                                //   name: recipientName,
                                //   number: Number(recipientPhone),
                                //   type: button,
                                // });
                            } else if (button === 'signup') {
                                const { message, listOfButtons } = getSimpleButtonsMessage(
                                    language,
                                    'startSignup'
                                );
                                await sendSimpleButtons(message, listOfButtons, recipientPhone);
                                // await Marketing.create({
                                //   name: recipientName,
                                //   number: Number(recipientPhone),
                                //   type: button,
                                // });
                            }
                        }
                    }

                    await Whatsapp.markMessageAsRead({ message_id });
                });

                console.log('[WEBHOOK] 🚀 Executing callback function...');
                callBack(message, session);
                console.log('[WEBHOOK] ✅ Callback function completed');
            } else {
                console.log('[WEBHOOK] ⏰ Message is too old, ignoring');
                console.log('[WEBHOOK] Current time:', Math.floor(Date.now() / 1000));
                console.log('[WEBHOOK] Message time:', timestamp);
                console.log('[WEBHOOK] Time difference:', Math.floor(Date.now() / 1000) - timestamp, 'seconds');
            }
        } else {
            console.log('[WEBHOOK] ❌ Message validation failed - not a valid message');
            console.log('[WEBHOOK] Message object:', JSON.stringify(message, null, 2).substring(0, 300));
        }

        console.log('[WEBHOOK] ✅ Sending 200 OK response to Meta');
        console.log('='.repeat(60) + '\n');
        res.sendStatus(200);
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('[WEBHOOK ERROR] ❌ Exception caught in webhook handler');
        console.error('[WEBHOOK ERROR] Message:', error.message);
        console.error('[WEBHOOK ERROR] Stack:', error.stack);
        console.error('='.repeat(60) + '\n');

        // Attempt to notify the user if possible
        try {
            if (req.body && req.body.entry && req.body.entry[0].changes && req.body.entry[0].changes[0].value.messages) {
                const message = req.body.entry[0].changes[0].value.messages[0];
                const recipientPhone = Number(message.from);
                // sendTextMessage("⚠️ Oops! Something went wrong on our end. Please type 'Hi' to restart.", recipientPhone).catch(() => {});
            }
        } catch (e) {
            // Ignore reporting error
        }

        // Always return 200 to Meta even on error to prevent retries
        return res.sendStatus(200);
    }
};

export const browserAttendanceController = async (req, res) => {
    try {
        const body = req.body;

        console.log({ ...body, file: body.file.slice(0, 10) }, 'browser check in');

        if (!body.latitude && !body.longitude) {
            return res.json({
                status: 'failed',
                message: 'Location not found. refresh page and try again',
            });
        }

        const employeeNumber = Number(body.employeeNumber);

        const isRegistered = await isRecipientRegistered(employeeNumber, session);

        if (isRegistered) {
            const userSession = session.get(employeeNumber);

            const isAnyLocation = userSession.user.locations.find(
                (location) => location.name === 'Any Location'
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
                        status: 'failed',
                        message:
                            'You are unable to mark attendance because your current location falls outside the geo-fencing area. try to mark attendance within the specified location.',
                    });
                }
            }

            const checkIn = await isCheckIn(userSession.user);
            console.log(checkIn)

            if (checkIn.attendance) {
                return res.json({ status: 'failed', message: 'Already Checked-In' });
            }

            const attendanceType = body.attendanceType;

            const imageName = `${employeeNumber}-${Date.now()}.png`;
            const filePath = `${process.env.ROOT_PATH}/uploads/${imageName}`;

            await fs.writeFile(filePath, Buffer.from(body.file, 'base64'));

            const uploadRes = await uploadFileToBucket(filePath, imageName);

            if (uploadRes.status === 'success') {
                const url = uploadRes.url;

                fs.unlink(filePath);

                const { name, address, id } = await markAttendance(
                    attendanceType,
                    employeeNumber,
                    {
                        [attendanceType === 'in' ? 'checkInPic' : 'checkOutPic']: url,
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
                    status: 'success',
                    message: 'Mark Attendance Success',
                });

                const departmentHeadNumbers = userSession.user.department.map(
                    (d) => d.head.number
                );

                // const hods = await Employee.find(
                //   {
                //     companyId: userSession.user.companyId,
                //     'department.head.id': { $in: departmentHeadIds },
                //     role: 'hod',
                //   },
                //   { employeeNumber: 1 }
                // );

                // const message = `A quick update to let you know that ${userSession.user.employeeName} has checked in at ${address}.`;
                // const listOfButtons = [
                //   {
                //     id: `full-day@${id}`,
                //     title: 'Full Day',
                //   },
                //   {
                //     id: `half-day@${id}`,
                //     title: 'Half Day',
                //   },
                //   {
                //     id: `absent@${id}`,
                //     title: 'Absent',
                //   },
                // ];

                // if (hods && hods.length > 0) {
                //   for (const hod of hods) {
                if (departmentHeadNumbers && departmentHeadNumbers.length > 0) {
                    for (const hod of departmentHeadNumbers) {
                        await delay(300);

                        await sendImageWithActionAttendanceNotificationTemplate(
                            hod,
                            userSession.user.employeeName,
                            address,
                            url,
                            id
                        );

                        // await sendSimpleButtonsWithImage({
                        //   // recipientPhone: hod.employeeNumber,
                        //   recipientPhone: hod,
                        //   message,
                        //   listOfButtons,
                        //   link: url,
                        // });
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

                        await sendImageAttendanceNotificationTemplate(
                            employer.employerNumber,
                            userSession.user.employeeName,
                            address,
                            url
                        );

                        // await sendImage({
                        //   recipientPhone: employer.employerNumber,
                        //   url,
                        //   caption: message,
                        // });
                    }
                }
            } else {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to upload attendance photo',
                });
            }
        } else {
            return res.status(500).json({
                status: 'error',
                message: 'You are not registered',
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to upload attendance photo',
        });
    }
};

function isMessage(message) {
    return message?.isMessage;
}

function parseMessage(message) {
    return {
        incomingMessage: message,
        recipientName: message.from.name,
        recipientPhone: Number(message.from.phone),
        typeOfMsg: message.type,
        message_id: message.message_id,
        timestamp: Number(message.timestamp) * 1000,
    };
}

function isMessageRecent(timestamp) {
    const currentTimestamp = new Date().getTime();
    const timeDifference = currentTimestamp - timestamp;

    // Accept messages that are recent (within last 60 seconds)
    // and not from the future (allowing 10 second clock skew)
    return timeDifference >= -10000 && timeDifference <= 300 * 1000;
}

export async function isRecipientRegistered(recipientPhone, currentSession) {
    if (currentSession.has(recipientPhone)) {
        currentSession.get(recipientPhone).ttl = Date.now() + ONE_HOUR_IN_MS;
        return currentSession.get(recipientPhone).isRegistered;
    }

    const employee = await Employee.findOne({
        employeeNumber: recipientPhone,
        isActive: true,
    });

    if (employee) {
        currentSession.set(recipientPhone, {
            isRegistered: true,
            user: {
                isEmployee: true,
                employeeName: employee.employeeName,
                employeeNumber: employee.employeeNumber,
                companyName: employee.companyName,
                employerNumber: employee.employerNumber,
                natureOfTime: employee.natureOfTime,
                checkIn: moment.tz(employee.checkIn, employee.timeZone),
                checkOut: moment.tz(employee.checkOut, employee.timeZone),
                requiredHours: moment.tz(employee.requiredHours, employee.timeZone),
                locations: employee.locations,
                companyId: employee.companyId.toString(),
                employeeId: employee._id.toString(),
                language: employee.language,
                timeZone: employee.timeZone,
                countryName: employee.countryName,
                bufferTime: employee.bufferTime * 60 * 1000,
                shiftType: employee.shiftType,
                proof: employee.proof,
                createdAt: employee.createdAt,
                workDays: employee.workDays,
                role: employee.role,
                department: employee.department,
                // dept: employee.dept,
            },
            ttl: Date.now() + ONE_HOUR_IN_MS,
        });

        return true;
    }

    const employer = await Employer.findOne({ employerNumber: recipientPhone });

    if (employer) {
        currentSession.set(recipientPhone, {
            isRegistered: true,
            user: {
                employerName: employer.fullName,
                isEmployee: false,
                companyId: employer.companyId ?? employer._id.toString(),
                companyNumber: employer.employerNumber,
                companyName: employer.companyName,
                language: employer.language,
                notifications: employer.notifications,
                registeredOn: employer.registeredOn,
                places: employer.branch,
                countryName: employer.countryName,
                countryCode: employer.countryCode,
                timeZone: employer.timeZone,
                regionName: employer.regionName,
                departments: employer.departments,
                halfDayPolicy: employer.halfDayPolicy,
            },
            ttl: Date.now() + ONE_HOUR_IN_MS,
        });

        return true;
    }

    return false;
}

function updateUserSession(sessionItems, session, recipientPhone) {
    Object.entries(sessionItems).forEach(([sessionKey, sessionValue]) => {
        session.get(recipientPhone)[sessionKey] = sessionValue;
    });
}

async function sendSignupFlow(language, recipientPhone) {
    const message = getTextMessage(language, 'signup', [], 'main');

    const { flowBody, flow } = getFlowMessageData(message);

    const flowData = {
        screen: 'Sign_Up',
        data: {
            ...flow,
        },
    };

    await sendFlow({
        body: flowBody,
        flow_data: flowData,
        flow_cta: 'Sign Up',
        flow_id: SIGN_UP_FLOW_ID,
        flow_token: SIGN_UP_FLOW_TOKEN,
        recipientPhone,
    });
}

function getFlowMessageData(message) {
    let flowBody = '';
    let flow = {};

    if (message.messageOne && message.messageTwo) {
        flowBody = `${message.messageOne.body}\n------------------\n${message.messageTwo.body}`;
        flow = message.messageTwo.label;
    } else {
        flowBody = message.body;
        flow = message.label;
    }

    return { flow, flowBody };
}

function checkIsInRange(location, recipientLat, recipientLong) {
    const distance = calculateDistance(
        location.lat,
        location.long,
        recipientLat,
        recipientLong
    );

    if (distance > location.range) {
        return false;
    } else {
        return true;
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c * 1000;

    return distance;
}

async function logMessageToCSV(message) {
    try {
        const {
            from,
            timestamp,
            type,
            text,
            image,
            interactive,
            location,
            document,
            audio,
            video,
        } = message;

        // Format the timestamp
        const time = moment
            .unix(timestamp)
            .tz('Asia/Kolkata')
            .format('DD/MM/YY hh:mm A');

        // Extract relevant data based on the message type
        const data = {
            name: from.name || 'Unknown',
            phone: from.phone,
            type: interactive?.nfm_reply ? 'flow' : type || 'undefined',
            time,
            text: text?.body || '',
            button: interactive?.button_reply?.title || '',
            media: image?.id || document?.id || '',
            coords: location ? `${location.latitude}, ${location.longitude}` : '',
            response_json: interactive?.nfm_reply?.response_json || '',
            audio: audio?.id || '',
            video: video?.id || '',
        };

        console.log(data);

        // Create a CSV row
        const row = `${data.name},${data.phone},${data.type},${data.time},${data.text},${data.button},${data.media},${data.coords},${data.response_json}\n`;

        // Check if file exists, if not, add headers
        const filePath = 'message_logs.csv';
        if (!existsSync(filePath)) {
            const headers =
                'Name,Phone,Type,Time,Text,Button,Media,Coords,Response_Json\n';
            await fs.writeFile(filePath, headers);
        }

        // Append the new row to the file
        fs.appendFile(filePath, row, (err) => {
            if (err) throw err;
        });
    } catch (err) {
        console.error(err);
    }
}
