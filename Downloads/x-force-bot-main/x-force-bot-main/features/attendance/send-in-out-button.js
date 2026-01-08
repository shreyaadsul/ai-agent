import session from './../../lib/session.js';

import { getSimpleButtonsMessage } from '../../utils/languages.js';
import { sendFlow, sendSimpleButtons, sendTextMessage } from '../../utils/messages.js';
import { isDifferenceGreaterThan12_5Hours } from '../../utils/utils.js';
import FLOW_CREDS, { FLOW_TOKEN } from '../../utils/constants.js';

import Attendance from '../../models/attendanceModel.js';
import Employee from '../../models/employeeModel.js';

export default async function sendInOutButton(buttonId, recipientPhone) {
  const user = session.get(recipientPhone).user;

  let { message, listOfButtons } = getSimpleButtonsMessage(
    user.language,
    buttonId
  );

  let attendanceExists;

  if (user.shiftType === 'day/night') {
    const date = new Date();

    attendanceExists = await Attendance.find({
      employeeId: user.employeeId,
      companyId: user.companyId,
      date: {
        $eq: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      },
    });

    if (attendanceExists.length === 0) {
      date.setDate(date.getDate() - 1);

      attendanceExists = await Attendance.find({
        employeeId: user.employeeId,
        companyId: user.companyId,
        date: {
          $eq: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        },
      });

      if (attendanceExists.length === 0) {
        listOfButtons = listOfButtons.filter((button) => button.id === 'in');
      } else if (attendanceExists.length > 0) {
        attendanceExists = attendanceExists[attendanceExists.length - 1];

        if (attendanceExists.checkInTime && attendanceExists.checkOutTime) {
          listOfButtons = listOfButtons.filter((button) => button.id === 'in');
        } else {
          const isDifferenceGreater = isDifferenceGreaterThan12_5Hours(
            attendanceExists.checkInTime
          );

          if (isDifferenceGreater.isGreater) {
            listOfButtons = listOfButtons.filter(
              (button) => button.id === 'in'
            );
          } else {
            listOfButtons = listOfButtons.filter(
              (button) => button.id === 'out'
            );
          }
        }
      }
    } else if (attendanceExists.length > 0) {
      attendanceExists = attendanceExists[attendanceExists.length - 1];

      if (attendanceExists.checkInTime && attendanceExists.checkOutTime) {
        if (attendanceExists.companyId === process.env.GREEN_PEBBLE_COMPANY_ID) {
          const employees = await Employee.find({
            companyId: process.env.GREEN_PEBBLE_COMPANY_ID,
            isActive: true,
          }).select(['_id', 'employeeName',]);

          const employeesList = employees.map((employee) => {
            return {
              id: `${employee._id.toString()}::${employee.employeeName}`,
              title: employee.employeeName,
            };
          });

          const flowData = {
            screen: 'Select_Shift',
            data: {
              employees: [{ id: "self", title: "Self Shift" }, ...employeesList],
            },
          };

          return await sendFlow({
            body: "👋 Hey! Our records show that you\'ve already checked in.\n\n✅ If you're working someone else's shift, please tap the Select button and select their name.\n\n🙋‍♂️ If you're working your own shift, just select Self.",
            flow_data: flowData,
            flow_cta: 'Select',
            flow_id: FLOW_CREDS.attendanceShiftSelection,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else {
          listOfButtons = listOfButtons.filter((button) => button.id === 'in');
        }

      } else {
        const isDifferenceGreater = isDifferenceGreaterThan12_5Hours(
          attendanceExists.checkInTime
        );

        if (isDifferenceGreater.isGreater) {
          listOfButtons = listOfButtons.filter(
            (button) => button.id === 'in'
          );
        } else {
          listOfButtons = listOfButtons.filter(
            (button) => button.id === 'out'
          );
        }
      }
    }
  } else {
    attendanceExists = await Attendance.findAttendance(
      user.employeeId,
      user.companyId
    );

    if (attendanceExists.length === 0) {
      listOfButtons = listOfButtons.filter((button) => button.id === 'in');
    } else if (attendanceExists) {
      if (attendanceExists.checkInTime && attendanceExists.checkOutTime) {
        if (attendanceExists.companyId === process.env.GREEN_PEBBLE_COMPANY_ID) {
          const employees = await Employee.find({
            companyId: process.env.GREEN_PEBBLE_COMPANY_ID,
            isActive: true,
          }).select(['_id', 'employeeName',]);

          const employeesList = employees.map((employee) => {
            return {
              id: `${employee._id.toString()}::${employee.employeeName}`,
              title: employee.employeeName,
            };
          });

          const flowData = {
            screen: 'Select_Shift',
            data: {
              employees: [{ id: "self", title: "Self Shift" }, ...employeesList],
            },
          };

          return await sendFlow({
            body: "👋 Hey! Our records show that you\'ve already checked in.\n\n✅ If you're working someone else's shift, please tap the Select button and select their name.\n\n🙋‍♂️ If you're working your own shift, just select Self.",
            flow_data: flowData,
            flow_cta: 'Select',
            flow_id: FLOW_CREDS.attendanceShiftSelection,
            flow_token: FLOW_TOKEN,
            recipientPhone,
          });
        } else {
          listOfButtons = listOfButtons.filter((button) => button.id === 'in');
        }
      } else {
        listOfButtons = listOfButtons.filter((button) => button.id === 'out');
      }
    }
  }

  if (user.companyId === process.env.SCCS_COMPANY_ID) {
    if (attendanceExists) {
      message = 'You have already checked in.';
      return await sendTextMessage(message, recipientPhone);
    }
  }

  return await sendSimpleButtons(message, listOfButtons, recipientPhone);
}
