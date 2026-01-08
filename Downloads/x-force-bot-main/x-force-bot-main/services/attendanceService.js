
import Attendance from '../models/attendanceModel.js';
import Employee from '../models/employeeModel.js';
import Issue from '../models/issuesModel.js';

/**
 * Saves or updates attendance record for the current day.
 * @param {string} employeeId - The ID of the employee.
 * @param {string} companyId - The ID of the company.
 * @param {string} logData - The text message or log content to save.
 * @param {string} status - Optional status to update (e.g., 'late', 'onTime').
 * @returns {Promise<Object>} The updated attendance document.
 */
export async function saveAttendanceLog(employeeId, companyId, logData, status) {
    const date = new Date();
    // Normalize to start and end of day for querying
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    let attendance = await Attendance.findOne({
        employeeId,
        companyId,
        date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (!attendance) {
        // Create new attendance record if none exists for today
        attendance = new Attendance({
            employeeId,
            companyId,
            date: date,
            status: status || 'absent', // Default to absent or pending until check-in
            logs: []
        });
    }

    // Add the log entry
    if (logData) {
        attendance.logs.push({
            time: new Date(),
            logType: 'text',
            log: logData
        });
    }

    // Update status if provided
    if (status) {
        attendance.status = status;
    }

    await attendance.save();
    return attendance;
}

/**
 * Fetches recent attendance logs for an employee to provide context.
 * @param {string} employeeId 
 * @param {string} companyId 
 * @param {number} limit 
 * @returns {Promise<Array>} List of attendance records.
 */
export async function getAttendanceHistory(employeeId, companyId, limit = 5) {
    return await Attendance.find({ employeeId, companyId })
        .sort({ date: -1 })
        .limit(limit);
}

/**
 * Escalates an issue by creating a ticket in the Issues collection.
 * @param {string} employeeId 
 * @param {string} companyId 
 * @param {string} reason 
 * @param {string} severity - 'medium' (Team Lead) or 'high' (Manager)
 */
export async function escalateToManager(employeeId, companyId, reason, severity) {
    // Generate a random ticket number
    const ticketNumber = Math.floor(Math.random() * 90000) + 10000;

    const issueType = severity === 'high' ? 'Manager Escalation' : 'Team Lead Warning';

    await Issue.create({
        employeeId,
        companyId,
        issueType: issueType,
        remark: reason,
        ticketNumber,
        date: new Date(),
        status: 'open'
    });

    console.log(`[ESCALATION] Created Ticket #${ticketNumber} for ${employeeId}: ${reason} [Severity: ${severity}]`);
    return ticketNumber;
}
