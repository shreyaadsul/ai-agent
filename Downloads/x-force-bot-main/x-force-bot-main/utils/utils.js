import axios from "axios";
import csv from "csv-parser";
import FormData from "form-data";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import moment from "moment-timezone";
import { join } from "path";
import session from "../lib/session.js";
import { Attendance, Employer } from "../models/index.js";
import { EPOCH } from "./constants.js";
import { sendMail } from "./logger.js";
import {
	createTemplate,
	sendLocation,
	sendTextMessage,
	WHATSAPP_API,
} from "./messages.js";

export async function axiosConfig(url, method, data = "") {
	return {
		method,
		maxBodyLength: Infinity,
		url,
		headers: {
			Authorization: `Bearer ${process.env.Meta_WA_accessToken}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: data,
	};
}

export async function axiosRequest(config) {
	try {
		const response = await axios(config);
		return response.data;
	} catch (error) {
		console.error(error.response.data);
	}
}

export async function delay(time) {
	return new Promise((resolve) => setTimeout(resolve, time));
}

export function updateUserSession(sessionItems, session, recipientPhone) {
	Object.entries(sessionItems).forEach(([sessionKey, sessionValue]) => {
		session.get(recipientPhone)[sessionKey] = sessionValue;
	});
}

export function getSixMonthsInMs(currentDate) {
	return new Date(currentDate.setMonth(currentDate.getMonth() + 6)).getTime();
}

export function convertTo12HourFormat(time) {
	const [hour, minute] = time.split(":");

	const date = new Date();

	date.setHours(hour);
	date.setMinutes(minute);

	return date.toLocaleTimeString("en-US", {
		timezone: "Asia/Kolkata",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function convertTo24HourFormat(time12h) {
	const [time, modifier] = time12h.split(" ");

	let [hours, minutes] = time.split(":");

	if (hours === "12") {
		hours = "00";
	}

	if (modifier === "PM") {
		hours = parseInt(hours, 10) + 12;
	}

	return `${hours}:${minutes}`;
}

export function getLanguage(language) {
	return language?.split("+")?.[1] ?? language;
}

export async function deleteFile(fileName) {
	const filePath = join(process.env.ROOT_PATH, fileName);

	if (fileExists(filePath)) {
		await fs.unlink(filePath);
	}
}

export async function fileExists(path) {
	try {
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
}

export function getDateParts(time) {
	return {
		year: time.year(),
		month: time.month(),
		date: time.date(),
		hours: time.hour(),
		minutes: time.minute(),
		seconds: time.second(),
	};
}

export function formatTime(time, type = "ms") {
	let hours = "";
	let minutes = "";

	if (type === "ms") {
		const seconds = Math.floor(time / 1000);

		hours = Math.floor(seconds / 3600);
		minutes = Math.floor((seconds % 3600) / 60);
	} else if (type === "secs") {
		hours = Math.floor(time / 3600);
		minutes = Math.floor((time % 3600) / 60);
	} else if (type === "mins") {
		hours = Math.floor(time / 60);
		minutes = (time % 60).toFixed(0);
	}

	return `${hours}hr ${minutes}m`.trim();
}

export async function getTimeZone(lat, long, recipientPhone) {
	try {
		const url = `${process.env.TIME_ZONE_API_URL}/get-time-zone?key=${process.env.TIME_ZONE_API_KEY}&format=json&by=position&lat=${lat}&lng=${long}`;
		const response = await axios.get(url);
		const timeZone = response.data;

		if (response.status === 200 && timeZone) {
			return {
				countryCode: timeZone.countryCode,
				countryName: timeZone.countryName,
				regionName: timeZone.regionName,
				timeZone: timeZone.zoneName,
			};
		}
		return response.data;
	} catch (err) {
		sendMail(
			"Failed to get time-zone",
			`Failed to get time-zone for lat: ${lat} and long: ${long} for ${recipientPhone}.`,
		);

		return {
			countryCode: "IN",
			countryName: "India",
			regionName: "Mahārāshtra",
			timeZone: "Asia/Kolkata",
		};
	}
	// const url = `${process.env.TIME_ZONE_API_URL}/get-time-zone?key=${process.env.TIME_ZONE_API_KEY}&format=json&by=position&lat=${lat}&lng=${long}`;

	// const response = await axios.request(url, { method: "GET", contentType: "application/json" });

	// return response.data;
}

export function getTimeZoneAwareDate(timeZone, date) {
	const options = {
		hour: "numeric",
		minute: "numeric",
		year: "2-digit",
		month: "numeric",
		day: "numeric",
		timeZone,
	};

	return new Intl.DateTimeFormat("en-GB", options).format(date).split(", ");
}

export function sortDatesAscending(datesArray) {
	const arrLen = datesArray.length;
	let min;

	for (let i = 0; i < arrLen; i++) {
		min = i;
		for (let j = 0; j < arrLen; j++) {
			if (compareDate(new Date(datesArray[min]), new Date(datesArray[j]))) {
				min = j;
			}
		}

		swap(i, min, datesArray);
	}
}

function compareDate(date1, date2) {
	return date2.getTime() < date1.getTime();
}

function swap(insertIndex, minIndex, array) {
	const temp = array[insertIndex];

	array[insertIndex] = array[minIndex];
	array[minIndex] = temp;
}

export function formatTime12h(time, timeZone) {
	return new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone,
		hour12: true,
	}).format(time);
}

export function capitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export function createEmployeeProperties(employees) {
	const result = {
		employeeList1: [],
		employeeList2: [],
		employeeList3: [],
		employeeList4: [],
	};

	const checkboxes = employees.map((employee) => {
		return {
			id: `${employee.employeeNumber}`,
			title: createFormattedString(
				employee.employeeName,
				`${formatTime12h(employee.checkIn)
					?.replace(" ", "")
					?.toLowerCase()}-${formatTime12h(employee.checkOut)
						?.replace(" ", "")
						?.toLowerCase()}`,
				employee.natureOfTime === "flexible" ? "Flexible" : "Fixed",
				employee.shiftType,
			),
		};
	});

	const arrs = splitArray(checkboxes, Object.keys(result).length);

	arrs.forEach((arr, i) => {
		result[`employeeList${i + 1}`].push(...arr);
	});

	return result;
}

function createFormattedString(userName, timingType, timing, shiftType) {
	const nameAbbreviation = `${userName.split(" ")[0].slice(0, 5)}${userName.split(" ")[1]?.charAt(0) ?? ""
		}`;

	const formattedTiming = timing?.replace(/^0/, "");

	const formattedString = `${nameAbbreviation} ${formattedTiming}-${timingType}-${shiftType === "day" ? "D" : "N"
		}`;

	if (formattedString.length > 30) {
		return formattedString.slice(0, 30);
	}

	return formattedString;
}

export function splitArray(arrs, chunkLength) {
	const arrayLength = arrs.length;

	if (arrayLength >= chunkLength) {
		const result = [];
		const equalChunkLength = Math.floor(arrayLength / chunkLength);
		const leftOverLength = arrayLength % chunkLength;

		for (let i = 0; i < chunkLength; i++) {
			result.push(arrs.slice(i * equalChunkLength, (i + 1) * equalChunkLength));
		}

		if (leftOverLength > 0) {
			result[0].push(...arrs.slice(arrayLength - leftOverLength));
		}

		return result;
	} else {
		const chunkLeft = chunkLength - arrayLength;
		return [
			...arrs.map((arr) => [{ ...arr }]),
			...Array.from({ length: chunkLeft }, () => [{ id: "null", title: "" }]),
		];
	}
}

export async function sendAttendanceNotification(
	employerNumber,
	companyId,
	data,
) {
	const notifications = await Employer.findNotfications(companyId);

	if (
		notifications?.notifications?.checkIn ||
		notifications?.notifications?.checkOut
	) {
		const { name, address } = data;

		const latitude = Number(data.latitude);
		const longitude = Number(data.longitude);

		if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
			await sendLocation({
				recipientPhone: employerNumber,
				latitude,
				longitude,
				name,
				address,
			});
		}

		// const template = createTemplate(
		//   'employer_attendance_notification_2',
		//   employerNumber,
		//   {
		//     headerComponent: [
		//       {
		//         type: 'header',
		//         parameters: [
		//           {
		//             type: 'location',
		//             location: {
		//               latitude: latitude,
		//               longitude: longitude,
		//               name: address,
		//               address: address,
		//             },
		//           },
		//         ],
		//       },
		//     ],
		//     bodyComponent: [
		//       {
		//         type: 'body',
		//         parameters: [
		//           {
		//             type: 'text',
		//             text: name,
		//           },
		//         ],
		//       },
		//     ],
		//   }
		// );

		// const response = await WHATSAPP_API.post('/messages', template);
	} else {
		console.error(
			`No notifications found for employerNumber: ${employerNumber} and companyId: ${companyId}`,
		);
	}
}

export async function markAttendance(
	type,
	recipientPhone,
	attendanceData,
	user,
) {
	try {
		const {
			employeeId,
			companyId,
			timeZone,
			natureOfTime,
			countryName,
			checkOut,
			requiredHours,
			bufferTime,
		} = user;

		const checkIn = user.checkIn.clone().add(bufferTime, "minutes");

		const { checkInPic, checkOutPic } = attendanceData;
		const coords = [attendanceData.lat ?? 0, attendanceData.long ?? 0];

		const time = moment.tz(new Date(), timeZone);

		const data = {
			recipientPhone,
			name: `${type.toUpperCase()}✅`,
			address: `${time.format(
				"DD/MM/YY hh:mm A",
			)} ${countryName} ${natureOfTime}`,
		};

		let attendance = await Attendance.findAttendance(employeeId, companyId);
		attendance = await handleNightShift(user, attendance);

		const shift = session.get(recipientPhone)?.shiftEmployee?.split("::");

		if (type === "in") {
			const checkInData = {
				employeeId,
				companyId,
				date: moment.tz(
					new Date(time.year(), time.month(), time.date()),
					timeZone,
				),
				checkInTime: time,
				checkInCoords: coords,
				checkInPic: checkInPic ?? "none",
			};

			if (Array.isArray(shift)) {
				checkInData.shift = {
					id: shift[0],
					name: shift[1],
				};
			}

			if (natureOfTime === "Fixed") {
				let status = "";

				if (isSunday() && companyId === process.env.HONDA_COMPANY_ID) {
					status = ["On Time", "onTime"];
				} else {
					status = generateCheckInStatus(
						time,
						{
							timeZone: user.timeZone,
							checkIn,
						},
						natureOfTime,
					);
				}

				checkInData.status = status[1];
				data.name += ` ${status[0]}`;
			} else if (natureOfTime === "Flexible") {
				checkInData.status = "onTime";
			}

			attendance = await Attendance.create(checkInData);
		} else {
			const { status, timeSpent } = generateCheckOutStatus(
				time,
				attendance,
				user,
			);

			data.name += ` ${timeSpent} ${status[0]}`;

			if (natureOfTime === "Fixed") {
				data.address += ` ${formatTime12h(checkIn)}-${formatTime12h(checkOut)}`;
			} else {
				data.address += ` ${requiredHours.hour()}h ${requiredHours.minute()}m`;
			}

			await Attendance.updateOne(
				{ _id: attendance._id.toString() },
				{
					checkOutTime: time,
					checkOutCoords: coords,
					checkOutPic: checkOutPic ?? "none",
					timeSpent,
					status: status[1],
				},
			);
		}

		return { ...data, id: attendance._id.toString() };
	} catch (e) {
		await sendTextMessage("Failed to mark attendance", recipientPhone);
		console.error(e);
	}
}

export async function handleNightShift(user, attendance) {
	const { shiftType, timeZone, employeeId, companyId } = user;

	if (shiftType === "day/night" && attendance.length === 0) {
		const time = moment.tz(new Date(), timeZone);
		const previousDate = getPreviousDayDate(time);

		const att = await Attendance.find({
			employeeId,
			companyId,
			date: {
				$eq: new Date(
					previousDate.year(),
					previousDate.month(),
					previousDate.date(),
				),
			},
		});

		if (att.length > 0) {
			attendance = att[att.length - 1];
		}
	}

	return attendance;
}

export function getPreviousDayDate(time) {
	return time.set("date", time.date() - 1);
}

export function generateCheckInStatus(time, user, natureOfTime) {
	const { timeZone, checkIn } = user;
	const { hours, minutes, seconds } = getDateParts(time);

	const status = calculateCheckInStatus(
		moment.tz(new Date(...EPOCH, hours, minutes, seconds), timeZone),
		checkIn,
		natureOfTime,
	);

	console.log(...EPOCH, hours, minutes, seconds);

	return status;
}

export function calculateCheckInStatus(
	checkInTime,
	fixedCheckInTime,
	natureOfTime,
) {
	// Normalize both times to the same date (today) for fair comparison
	const normalizedCheckIn = checkInTime.clone().set({
		year: 2024,
		month: 0,
		date: 1,
	});

	const normalizedFixed = fixedCheckInTime.clone().set({
		year: 2024,
		month: 0,
		date: 1,
	});

	// console.log(normalizedCheckIn, normalizedFixed)
	// console.log(checkInTime, fixedCheckInTime)

	// Get the difference in minutes for more precise comparison
	const diffInMinutes = normalizedCheckIn.diff(normalizedFixed, "minutes");

	if (natureOfTime === "Fixed") {
		console.log(diffInMinutes);

		if (diffInMinutes <= 0) {
			return ["On Time", "onTime"];
		}

		return ["Late", "late"];
	} else if (natureOfTime === "Flexible") {
		const gracePeriodMinutes = 5;
		if (diffInMinutes <= gracePeriodMinutes) {
			return ["On Time", "onTime"];
		}
		return ["Late", "late"];
	}
}

export function generateCheckOutStatus(time, attendance, user) {
	const { checkOut, timeZone, requiredHours, natureOfTime } = user;
	const { hours, minutes, seconds } = getDateParts(time);
	const epoch = [...EPOCH];

	let status = "";

	const timeSpentDuration = moment
		.duration(time.diff(moment.tz(attendance.checkInTime, timeZone)))
		.asMinutes();
	const timeSpent = formatTime(timeSpentDuration, "mins");

	const requiredWorkingMinutes =
		requiredHours.get("hours") * 60 + requiredHours.get("minutes");

	if (natureOfTime === "Flexible") {
		status =
			timeSpentDuration >= requiredWorkingMinutes
				? ["Full Day", "full-day"] // Worked enough time for a full day
				: ["Half Day", "half-day"]; // Not enough time for a full day
	} else {
		status = calculateCheckOutStatus(
			moment.tz(new Date(...epoch, hours, minutes, seconds), timeZone),
			checkOut,
			attendance.status,
		);
	}

	return { status, timeSpent };
}

export function calculateCheckOutStatus(
	checkOutTime,
	fixedCheckOutTime,
	checkInStatus,
) {
	if (checkInStatus === "late") return ["Half Day", "half-day"]; // Late check-in results in half day

	const diff = checkOutTime.diff(fixedCheckOutTime);

	if (diff >= 0) return ["Full Day", "full-day"]; // Check-out is on time or late
	return ["Half Day", "half-day"]; // Check-out is early
}

export async function makeApiRequest(message, recipientPhone, isEmployee = true) {
	const endpoint = isEmployee ? "employee" : "admin";
	const url = `http://localhost:5000/agent/${endpoint}`;

	const payload = isEmployee
		? { message: message, sender_id: String(recipientPhone) }
		: { question: message, sender_id: String(recipientPhone) };

	const apiConfig = {
		method: "post",
		maxBodyLength: Infinity,
		url: url,
		headers: {
			"Content-Type": "application/json",
		},
		data: JSON.stringify(payload),
	};

	try {
		console.log(`[AI AGENT] Sending request to ${url} for ${recipientPhone} (${isEmployee ? 'Employee' : 'Admin'})`);
		const response = await axios.request(apiConfig);
		console.log(`[AI AGENT] Response Check:`, response.data);
		const aiResponse = response.data.response || "I didn't get a response from the AI agent.";

		console.log(`[AI AGENT] Sending message to ${recipientPhone}:`, aiResponse);
		const result = await sendTextMessage(
			String(aiResponse),
			recipientPhone,
		);
		console.log(`[AI AGENT] sendTextMessage result:`, result);
	} catch (error) {
		console.error("[AI AGENT ERROR]", error.message);
		if (error.code === 'ECONNREFUSED') {
			await sendTextMessage("AI Agent server is not running. Please start the python agent-server.py.", recipientPhone);
		} else {
			await sendTextMessage("Sorry, I'm having trouble connecting to my AI brain right now.", recipientPhone);
		}
	}
}

export async function isCheckIn(user) {
	const { employeeId, companyId } = user;

	let attendance = await Attendance.findAttendance(employeeId, companyId);
	attendance = await handleNightShift(user, attendance);

	if (attendance && attendance.checkInTime && !attendance.checkOutTime) {
		const isDifferenceGreater = isDifferenceGreaterThan12_5Hours(
			attendance.checkInTime,
		);

		return {
			attendance,
			isGreater: isDifferenceGreater.hours < 12.5,
		};
	}

	return {
		isGreater: false,
	};
}

export async function getMediaUrl(mediaId) {
	try {
		const metaImageUrl = `https://graph.facebook.com/v16.0/${mediaId}`;
		const imageUrlConfig = await axiosConfig(metaImageUrl, "get");

		const { url } = await axiosRequest(imageUrlConfig);
		return url;
	} catch (e) {
		return "";
	}
}

export async function downloadAndSave(mediaUrl, fileName) {
	const downloadImageConfig = await axiosConfig(mediaUrl, "get");
	const response = await axios({
		...downloadImageConfig,
		responseType: "stream",
	});

	const fileStream = createWriteStream(fileName);

	response.data.pipe(fileStream);

	return await new Promise((resolve, reject) => {
		fileStream.on("finish", () => resolve(true));
		fileStream.on("error", () => reject(false));
	});
}

export function dateFromHourStr(date, hourStr, timeZone) {
	return moment.tz(
		new Date(date.year(), date.month(), date.date(), ...hourStr.split(":")),
		timeZone,
	);
}

export function calculateMonthRange(registeredOn, timeZone) {
	const date = moment.tz(new Date(), timeZone);
	const startDate = getRegisteredDate(registeredOn, date);

	const monthStart = moment.tz(
		new Date(date.year(), date.month(), startDate, 0, 0, 0),
		timeZone,
	);
	const monthEnd = moment.tz(
		new Date(date.year(), date.month(), date.daysInMonth(), 0, 0, 0),
		timeZone,
	);

	return { monthStart, monthEnd };
}

export function getRegisteredDate(registeredOn, currentDate) {
	const createdDate = new Date(registeredOn);
	const startDate = -1;

	if (
		createdDate.getFullYear() === currentDate.year() &&
		createdDate.getMonth() === currentDate.month()
	) {
		return createdDate.getDate();
	}

	return startDate;
}

export function convertTimeTo12HourFormat(time) {
	let formattedHours = parseInt(time.hour(), 10);
	const amPm = formattedHours >= 12 ? "PM" : "AM";
	formattedHours = formattedHours % 12 || 12;

	const formattedMinutes = String(time.minute()).padStart(2, "0");

	return `${formattedHours}:${formattedMinutes} ${amPm}`;
}

export function timeIn12H(timeZone) {
	return (time) =>
		new Intl.DateTimeFormat("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			timeZone,
			hour12: true,
		}).format(time);
}

export function getFlowMessageData(message) {
	let flowBody = "";
	let flow = {};

	if (message.messageOne && message.messageTwo) {
		flowBody = `${message.messageOne.body}\n------------------\n${message.messageTwo.body}`;
		flow = message.messageTwo.label;
	} else if (message.messageOne || message.messageTwo) {
		flowBody = message.messageOne.body
			? message.messageOne.body
			: message.messageTwo.body;
		flow = message.messageOne.label
			? message.messageOne.label
			: message.messageTwo.label;
	} else {
		flowBody = message.body;
		flow = message.label;
	}

	return { flow, flowBody };
}

export function getCurrentTime(timeZone) {
	return moment.tz(new Date(), timeZone);
}

export function getTime(time, timeZone) {
	return moment.tz(time, timeZone);
}

export function getTimeDiff(startTime, endTime) {
	return moment.duration(startTime.diff(endTime));
}

export async function uploadMedia(file_path) {
	try {
		const data = new FormData();

		data.append(
			"file",
			createReadStream(join(process.env.ROOT_PATH, `/${file_path}`)),
		);
		data.append("messaging_product", "whatsapp");

		const config = {
			method: "post",
			maxBodyLength: Infinity,
			url: `https://graph.facebook.com/v20.0/${process.env.Meta_WA_SenderPhoneNumberId}/media`,
			headers: {
				Authorization: `Bearer ${process.env.Meta_WA_accessToken}`,
				Cookie: "ps_l=1; ps_n=1",
				...data.getHeaders(),
			},
			data: data,
		};

		const res = await axios.request(config);

		if (res) {
			return res?.data?.id;
		}
	} catch (e) {
		console.error(e);
	}
}

function isSunday() {
	const today = new Date();
	return today.getDay() === 0; // 0 represents Sunday
}

export function getPrimaryLanguage(language) {
	return language
		? language.split("+").length > 1
			? language.split("+")[1]
			: language
		: "English";
}

export function isWorkingDay(workDays, day) {
	return !workDays.includes(day);
}

export function checkIsInRange(location, recipientLat, recipientLong) {
	const distance = calculateDistance(
		location.lat,
		location.long,
		recipientLat,
		recipientLong,
	) * 1000; // Convert KM to Meters

	if (distance > location.range) {
		return false;
	} else {
		return true;
	}
}

export function getGreeting(timeZone) {
	const currentHour = moment.tz(new Date(), timeZone).hour();

	let greeting;

	// Determine greeting based on time of day
	if (currentHour < 12) {
		greeting = "Good morning";
	} else if (currentHour < 18) {
		greeting = "Good afternoon";
	} else {
		greeting = "Good evening";
	}

	return greeting;
}

export function getTimeSpent(checkInTime, timeZone) {
	// Create moment objects for both the current time and check-in time, in the specified time zone
	const currentTime = moment.tz(new Date(), timeZone);
	const checkInMoment = moment.tz(checkInTime, timeZone);

	// Check if the day has changed compared to checkInTime
	if (checkInMoment.isSame(currentTime, "day")) {
		// If the day hasn't changed, use the current time
		var time = currentTime;
	} else {
		time = checkInMoment.clone().startOf("day").endOf("day");
	}

	// Calculate the duration between the current time (or start of the day) and check-in time
	const timeSpentDuration = moment
		.duration(time.diff(checkInMoment))
		.asMinutes();

	// Return formatted time spent (you can customize the format as needed)
	return formatTime(timeSpentDuration, "mins");
}

export async function parseCSV(filePath) {
	const results = [];

	return new Promise((resolve, reject) => {
		createReadStream(filePath)
			.pipe(csv())
			.on("data", (data) => results.push(data))
			.on("end", () => resolve(results))
			.on("error", (error) => reject(error));
	});
}

// export async function hasAttendanceNotificationPermission(recipientPhone) {}

export function getCurrentDayBounds(timeZone) {
	const day = moment.tz(new Date(), timeZone);

	const currentDayStart = new Date(
		day.year(),
		day.month(),
		day.date(),
		0,
		0,
		0,
	);

	const currentDayEnd = new Date(
		day.year(),
		day.month(),
		day.date(),
		23,
		59,
		59,
	);

	return {
		start: currentDayStart,
		end: currentDayEnd,
	};
}

export function getDepartmentButtonList(departments) {
	if (Array.isArray(departments) && departments.length > 0) {
		return departments.map((department) => {
			return {
				id: department.id,
				title: `${department.name} ${department.branch ? `(${department.branch})` : ""
					}`,
			};
		});
	}

	return [{ id: "null", title: "No departments" }];
}

export function calculateTimeDifference(checkIn, checkOut) {
	const checkInTime = new Date(checkIn);
	const checkOutTime = new Date(checkOut);

	// Ensure the difference is always positive
	const timeDifference = Math.abs(checkOutTime - checkInTime);

	// Calculate hours and minutes
	const hours = Math.floor(timeDifference / (1000 * 60 * 60));
	const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));

	return { hours, minutes };
}

// export function calculateWorkingHours(checkIn, checkOut) {
//   const differenceInMilliseconds = Math.abs(checkIn - checkOut);

//   const hours = Math.floor(differenceInMilliseconds / 3600000);
//   const minutes = Math.floor((differenceInMilliseconds % 3600000) / 60000);
//   const seconds = Math.floor((differenceInMilliseconds % 60000) / 1000);

//   return new Date(1970, 0, 1, hours, minutes, seconds);
// }

export function timeStringToEpochDate(timeString) {
	const [hours, minutes] = timeString.split(":");
	return new Date(1970, 0, 1, hours, minutes, 0, 0);
}

export function calculateWorkingHours(startTime, endTime) {
	// Convert time strings to minutes since midnight
	function timeToMinutes(timeStr) {
		const [hours, minutes] = timeStr.split(":").map((num) => {
			const parsed = parseInt(num, 10);
			if (isNaN(parsed)) throw new Error("Invalid time component");
			return parsed;
		});

		if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
			throw new Error("Time components out of valid range");
		}

		return hours * 60 + minutes;
	}

	// Convert total minutes to hours and minutes object
	function minutesToHoursAndMinutes(totalMinutes) {
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return { hours, minutes };
	}

	const start = timeToMinutes(startTime);
	let end = timeToMinutes(endTime);

	// If end time is before start time, it means the period crosses midnight
	if (end < start) {
		// Add 24 hours (1440 minutes) to end time
		end += 24 * 60;
	}

	// Calculate the difference in minutes
	const workingMinutes = end - start;

	const requriredTime = minutesToHoursAndMinutes(workingMinutes);

	return new Date(1970, 0, 1, requriredTime.hours, requriredTime.minutes, 0);
}

export function isDifferenceGreaterThan12_5Hours(givenTime) {
	const givenDate = new Date(givenTime);
	if (isNaN(givenDate.getTime())) {
		return {
			isGreater: false,
		};
	}

	const currentTime = new Date();
	const differenceInMs = Math.abs(currentTime.getTime() - givenDate.getTime());
	const differenceInHours = differenceInMs / (1000 * 60 * 60);

	return {
		hours: differenceInHours,
		isGreater: differenceInHours > 12.5,
	};
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
	const R = 6371; // Radius of the earth in km
	const dLat = (lat2 - lat1) * (Math.PI / 180);
	const dLon = (lon2 - lon1) * (Math.PI / 180);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * (Math.PI / 180)) *
		Math.cos(lat2 * (Math.PI / 180)) *
		Math.sin(dLon / 2) *
		Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	const distance = R * c; // Distance in km
	return distance;
}
