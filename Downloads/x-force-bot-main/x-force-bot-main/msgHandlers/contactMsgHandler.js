import moment from 'moment-timezone';
import _ from 'lodash';

import {
  sendTextMessage,
  // sendImage,
  sendEmployeeDemoTemplate,
  sendFlow,
  sendSimpleButtons,
} from '../utils/messages.js';
import { getTextMessage, getSimpleButtonsMessage } from '../utils/languages.js';
import {
  EDIT_EMPLOYEE_FLOW_ID,
  EDIT_EMPLOYEE_FLOW_TOKEN,
  EPOCH,
} from '../utils/constants.js';
import {
  formatTime12h,
  getDepartmentButtonList,
  getFlowMessageData,
} from '../utils/utils.js';
import {
  Employee,
  Employer,
  OwnerTransferLogs,
  CoownerLogs,
} from '../models/index.js';

const BOT = 'main';

async function handleContactMessage({ contacts, recipientPhone, session }) {
  const { user, session: sessionType } = session.get(recipientPhone);

  if (user.role === 'employee' || user.role === 'coowner') {
    const message = getTextMessage(user.language, 'contacts');
    return await sendTextMessage(message, recipientPhone);
  }

  if (sessionType === 'transferOwner') {
    const contact = contacts[0];

    if (
      _.has(contact, 'name') &&
      _.has(contact, 'phones') &&
      Array.isArray(contact.phones) &&
      contact.phones.length > 0
    ) {
      const transferLogs = new OwnerTransferLogs({
        status: 'pending',
        companyId: user.companyId,
        from: {
          time: moment.tz(new Date(), user.timeZone),
        },
        to: {
          time: moment.tz(new Date(), user.timeZone),
        },
      });

      const name = contact.name.formatted_name;
      const number = contact.phones[0].wa_id.replace(/\+| /g, '');

      const employee = await Employee.findOne(
        {
          employeeNumber: Number(number),
          companyId: user.companyId,
          isActive: true,
        },
        {
          _id: 1,
          role: 1,
          employeeName: 1,
          employeeNumber: 1,
          companyName: 1,
          language: 1,
        }
      );

      if (employee) {
        const { message, listOfButtons } = getSimpleButtonsMessage(
          user.language,
          'ownerEmpContact',
          [name, employee.role],
          BOT
        );
        await sendSimpleButtons(
          message,
          listOfButtons(
            `${employee._id.toString()}@${employee.employeeNumber
            }@${transferLogs._id.toString()}`
          ),
          recipientPhone
        );

        transferLogs.to.employeeId = employee._id.toString();
        transferLogs.to.priorType = employee.role;
      } else {
        const { message, listOfButtons } = getSimpleButtonsMessage(
          'English',
          'acceptowner',
          [name, user.employerName, user.companyName],
          BOT
        );

        await sendSimpleButtons(
          message,
          listOfButtons(
            `undefined@${transferLogs._id.toString()}@${recipientPhone}@English@${name}`
          ),
          number
        );

        const confimReqMessage = getTextMessage(
          user.language,
          'coownerConfirmation',
          [name]
        );
        await sendTextMessage(confimReqMessage, recipientPhone);

        transferLogs.to.priorType = 'newContact';
      }

      await OwnerTransferLogs.create(transferLogs);
    } else {
      const message = getTextMessage(user.language, 'validContact');
      await sendTextMessage(message, recipientPhone);
    }

    return;
  } else if (sessionType === 'addCoowner') {
    const contact = contacts[0];
    if (
      _.has(contact, 'name') &&
      _.has(contact, 'phones') &&
      Array.isArray(contact.phones) &&
      contact.phones.length > 0
    ) {
      const addCoownerLogs = new CoownerLogs({
        status: 'pending',
        companyId: user.companyId,
        from: {
          time: moment.tz(new Date(), user.timeZone),
        },
        to: {
          time: moment.tz(new Date(), user.timeZone),
        },
      });

      const name = contact.name.formatted_name;
      const number = contact.phones[0].wa_id.replace(/\+| /g, '');

      const employee = await Employee.findOne(
        {
          employeeNumber: Number(number),
          companyId: user.companyId,
          isActive: true,
        },
        { _id: 1, role: 1, employerNumber: 1, language: 1, employeeNumber: 1 }
      );

      if (employee) {
        const { message, listOfButtons } = getSimpleButtonsMessage(
          user.language,
          'coownerEmpContact',
          [name, employee.role],
          BOT
        );
        await sendSimpleButtons(
          message,
          listOfButtons(
            `${employee._id.toString()}@${employee.employeeNumber
            }@${addCoownerLogs._id.toString()}`
          ),
          recipientPhone
        );

        addCoownerLogs.to.employeeId = employee._id.toString();
        addCoownerLogs.to.priorType = employee.role;
      } else {
        const data = `undefined@${recipientPhone}@${name}@${addCoownerLogs._id.toString()}`;

        const { message, listOfButtons } = getSimpleButtonsMessage(
          'English',
          'coownerRequest',
          [name, user.employerName, user.companyName],
          BOT
        );

        await sendSimpleButtons(message, listOfButtons(data), number);
        const confirmMessage = getTextMessage(
          user.language,
          'coownerConfirmation',
          [name],
          BOT
        );
        await sendTextMessage(confirmMessage, recipientPhone);

        addCoownerLogs.to.priorType = 'newContact';
      }

      await CoownerLogs.create(addCoownerLogs);
    } else {
      const message = getTextMessage(user.language, 'validContact');
      await sendTextMessage(message, recipientPhone);
    }

    return;
  }

  let branches = user.places;
  let employees = [];

  const parsedContacts = parseContacts(contacts, recipientPhone, user.language);
  const uniqueContacts = getUniqueContacts(parsedContacts);

  await Promise.allSettled(
    uniqueContacts.map(async (contact) => {
      const [employeeName, employeeNumber] = contact;

      const employee = await Employee.findOne({
        companyId: user.companyId,
        employeeNumber,
        isActive: true,
      });

      if (employee) {
        await sendEditEmployeeFlow(
          employee,
          recipientPhone,
          branches,
          user.language,
          user.departments
        );

        throw new Error('emp-exist');
      } else {
        try {
          let bufferTime = user.bufferTime;

          if (!bufferTime) {
            const companyDetails = await Employer.findOne(
              {
                employerNumber: recipientPhone,
              },
              { bufferTime: 1 }
            );

            bufferTime = companyDetails?.bufferTime ?? 15;
            session.get(recipientPhone).user['bufferTime'] = bufferTime;
          }

          const nineHoursInMs = 12600000;

          const data = {
            employeeName: employeeName,
            employeeNumber: employeeNumber,
            companyId: user.companyId,
            companyName: user.companyName,
            employerNumber: recipientPhone,
            checkIn: new Date(...EPOCH, 9, 30),
            checkOut: new Date(...EPOCH, 18, 30),
            requiredHours: nineHoursInMs,
            countryName: user.countryName,
            countryCode: user.countryCode,
            timeZone: user.timeZone,
            regionName: user.regionName,
            bufferTime,
          };

          const res = await Employee.create(data);

          if (res) {
            sendEmployeeDemoTemplate(`${user.companyName}`, employeeNumber);

            // employees.push(['success', employeeName]);

            branches = await Employer.findBranch(
              recipientPhone,
              user.companyId
            );

            return await sendEditEmployeeFlow(
              res,
              recipientPhone,
              branches?.branch,
              user.language,
              user.departments,
              user.timeZone
            );
          }
        } catch (e) {
          employees.push(['error', employeeName]);
          throw new Error(
            `Failed to Upload: name: ${employeeName} number: ${employeeNumber}. Try uploading again.`
          );
        }
      }
    })
  );

  // let statusOfUpload = '';

  // employees.forEach(([status, name]) => {
  //   if (status === 'success') {
  //     statusOfUpload += `*${name}* - ✅ uploaded\n`;
  //   } else {
  //     statusOfUpload += `*${name}* - ❌ failed\n`;
  //   }
  // });

  // const isFulfilled = promises.some(
  //   (promise) => promise.status === 'fulfilled'
  // );

  // if (isFulfilled) {
  //   const message = getTextMessage(user.language, 'employeeUploaded', [], BOT);

  //   await sendImage({
  //     recipientPhone,
  //     caption: `${message}\n\n${statusOfUpload}`,
  //     url: 'https://i.ibb.co/S6XxtXy/Hi-2.png',
  //   });
  // }
}

async function sendEditEmployeeFlow(
  employee,
  employerNumber,
  locations,
  language,
  departments,
  timeZone
) {
  try {
    const {
      employeeName,
      employeeNumber,
      checkIn,
      checkOut,
      natureOfTime,
      shiftType,
      workDays,
      proof,
    } = employee;

    if (!locations || locations.length === 0) {
      locations = [{ id: 'Any Location', title: 'Any Location' }];
    } else if (locations.length > 0) {
      locations = [
        { id: 'Any Location', title: 'Any Location' },
        ...[...locations.filter(l => l.name !== 'Any Location')].map((location) => ({
          id: `${location.name}_@_${location.lat}_@_${location.long}_@_${location.range}`,
          title: location.name,
        })),
      ];
    }

    const message = getTextMessage(language, 'editEmployee', [], BOT);

    const { flow, flowBody } = getFlowMessageData(message);

    const uniqueDepartments = []
    const flowDepartments = []

    if (Array.isArray(departments) && departments.length > 0) {
      departments.forEach(d => {
        if (!uniqueDepartments.includes(d.id)) {
          uniqueDepartments.push(d.id);
          flowDepartments.push({ id: d.id, title: d.name });
        }
      });
    }

    const flowData = {
      screen: 'Edit_Employee',
      data: {
        ...message.label,
        init_values: {
          employeeName: String(employeeName),
          employeeNumber: String(employeeNumber),
          checkin: new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timeZone,
          }).format(checkIn),
          checkout: new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timeZone,
          }).format(checkOut),
          branch: locations.length > 0 ? locations.filter(location => location.title !== "Any Location").map(location => location.id) : ["Any Location"],
          shiftType: shiftType,
          timing: natureOfTime,
          workdays: [...workDays.map(String)],
          proof: [
            ...Object.entries(proof)
              .filter(([, value]) => value)
              .map(([key]) => key),
          ],
        },
        all_extras: locations,
        departmentList: flowDepartments.length > 0 ? flowDepartments : [{ id: 'null', title: 'No Departments' }],
        ...flow,
      },
    };

    await sendFlow({
      header: 'Edit Employee',
      body: `${flowBody}\n\nName: *${employeeName}*\nNumber: *${employeeNumber}*\n`,
      flow_cta: 'Edit Employee',
      flow_token: EDIT_EMPLOYEE_FLOW_TOKEN,
      flow_id: EDIT_EMPLOYEE_FLOW_ID,
      flow_data: flowData,
      recipientPhone: employerNumber,
    });
  } catch (e) {
    console.error(e);
  }
}

function parseContacts(contacts, recipientPhone, language) {
  const parsedContacts = [];

  contacts.forEach(async (contact) => {
    if (
      _.has(contact, 'name') &&
      _.has(contact, 'phones') &&
      contact.phones.length > 0
    ) {
      const employeeName = contact.name.formatted_name;
      const employeeNumber = contact.phones[0]?.wa_id;

      parsedContacts.push([employeeName, employeeNumber]);
    } else {
      const message = getTextMessage(language, 'contactMissing', [
        contact.name.formatted_name,
      ]);
      await sendTextMessage(message, recipientPhone);
    }
  });

  return parsedContacts;
}

function getUniqueContacts(contacts) {
  const uniqueNumbers = new Set();

  contacts.forEach(([, employeeNumber]) => {
    uniqueNumbers.add(employeeNumber);
  });

  const uniqueContacts = [];

  uniqueNumbers.forEach((number) => {
    const contact = contacts.find(
      ([, contactNumber]) => number === contactNumber
    );
    uniqueContacts.push(contact);
  });

  return uniqueContacts;
}

export default handleContactMessage;
