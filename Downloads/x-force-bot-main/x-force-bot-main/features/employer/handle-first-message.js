import session from '../../lib/session.js';

import { Employee } from '../../models/index.js';

import flowIds, { FLOW_TOKEN } from '../../utils/constants.js';

import { getTextMessage } from '../../utils/languages.js';
import { sendFlow } from '../../utils/messages.js';

import {
  capitalize,
  formatTime12h,
  getFlowMessageData,
} from '../../utils/utils.js';

export default async function handleFirstEmployerMessage(recipientPhone) {
  const user = session.get(recipientPhone).user;

  const employees = await Employee.find(
    { companyId: user.companyId, isActive: true },
    {
      employeeNumber: 1,
      employeeName: 1,
      natureOfTime: 1,
      shiftType: 1,
      checkIn: 1,
      checkOut: 1,
    }
  );

  const employeesList = employees.map((employee) => {
    return {
      id: employee.employeeNumber.toString(),
      title: employee.employeeName,
      description: `${employee.natureOfTime}-${capitalize(
        employee.shiftType
      )}-(${formatTime12h(employee.checkIn)}-${formatTime12h(
        employee.checkOut
      )})`,
    };
  });

  const placesList = user.places?.map((place) => {
    return {
      id: place.name,
      title: place.name,
      description: `${place.range} meters`,
    };
  });

  const team =
    employeesList.length > 0
      ? employeesList
      : [{ id: 'null', title: 'No Employees' }];

  const message = getTextMessage(user.language, 'attendanceManagement');

  const { flow, flowBody } = getFlowMessageData(message);

  const hasDepartments = Array.isArray(user.departments) && user.departments.length > 0 ? 'true' : undefined;

  // const uniqueDepartments = []
  // const departmentReportOptions = []

  // if (hasDepartments) {
  //   user.departments.forEach(d => {
  //     if (!uniqueDepartments.includes(d.id)) {
  //       uniqueDepartments.push(d.id);
  //       departmentReportOptions.push({id: d.id, title: d.name});
  //     }
  //   });
  // }

  const flowData = {
    screen: 'Attendance_Management',
    data: {
      hasDepartments,
      departmentReportOptions: hasDepartments ? [
        {
          id: "liveReport",
          title: "Live Report",
          description: "Get live report of all departments",
        },
        {
          id: "yesterdayReport",
          title: "Yesterday Report",
          description: "Get yesterday report of all departments",
        },
        {
          id: "currentMonthReport",
          title: "Current Month Report",
          description: "Get current month report of all departments",
        },
        {
          id: "dateRangeReport",
          title: "Date Range Report",
          description: "Get report of all departments for a specific date range",
        }
      ] : [],
      init_values: {
        userData: '',
      },
      editgeo: [
        {
          id: 'multiple-edit-palces',
          title: 'Select Muliple',
          description: 'Select multiple places and edit them.',
        },
        ...placesList,
      ],
      deletegeo: [
        {
          id: 'delete-multiple-places',
          title: 'Select Muliple',
          description: 'Select multiple places and remove them.',
        },
        ...placesList,
      ],
      editshift: [
        {
          id: 'multiple-edit-shift',
          title: 'Select Muliple',
          description: 'Select multiple employees and edit their shift timings',
        },
        ...employeesList,
      ],
      deleteemployee: [
        {
          id: 'delete-multiple-employees',
          title: 'Select Muliple',
          description:
            'Select multiple employees and remove them from organization',
        },
        ...employeesList,
      ],
      editTimingsByBranch:
        placesList.length === 0
          ? [{ id: 'null', title: 'No Branches' }]
          : placesList,
      team,
      userData: '',
      ...flow,
    },
  };

  await sendFlow({
    body: flowBody,
    flow_data: flowData,
    flow_cta: 'AutowhatTask',
    flow_id: flowIds.employerFlow,
    flow_token: FLOW_TOKEN,
    recipientPhone,
  });
}
