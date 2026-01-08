import moment from 'moment-timezone';

export function formatTimeByTimezoneInHrMin(timezone, date) {
  const inputDate = new Date(date);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const formattedTime = formatter.format(inputDate);
  const [time] = formattedTime.split(' ');
  const [hr, minute] = time.split(':');

  return `${hr}h ${minute}m`;
}

export function timeIn12H(timeZone) {
  return (time) =>
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      hour12: true,
    }).format(time);
}

export function formatTime(time, type = 'ms') {
  let hours = '';
  let minutes = '';

  if (type === 'ms') {
    const seconds = Math.floor(time / 1000);

    hours = Math.floor(seconds / 3600);
    minutes = Math.floor((seconds % 3600) / 60);
  } else if (type === 'secs') {
    hours = Math.floor(time / 3600);
    minutes = Math.floor((time % 3600) / 60);
  } else if (type === 'mins') {
    hours = Math.floor(time / 60);
    minutes = (time % 60).toFixed(0);
  }

  return `${hours}hr ${minutes}m`.trim();
}

export function getTimeSpent(checkInTime, timeZone) {
  const currentTime = moment.tz(new Date(), timeZone);
  const checkInMoment = moment.tz(checkInTime, timeZone);

  if (checkInMoment.isSame(currentTime, 'day')) {
    var time = currentTime;
  } else {
    time = checkInMoment.clone().startOf('day').endOf('day');
  }

  const timeSpentDuration = moment
    .duration(time.diff(checkInMoment))
    .asMinutes();

  return formatTime(timeSpentDuration, 'mins');
}

export function getFormatDate(timeZone, date) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(new Date(`${date}`));
}

export function getAllDates(startDate, endDate) {
  let start = new Date(startDate);
  let end = new Date(endDate);

  if (isNaN(start) || isNaN(end) || start > end) {
    throw new Error('Invalid date range provided.');
  }

  let dates = [];

  while (start <= end) {
    const date = moment(start);
    dates.push({ date, formattedDate: date.format('YYYY-MM-DD') });

    start.setDate(start.getDate() + 1);
  }

  return dates;
}

export function getCurrentDayBounds(timeZone) {
  const day = moment.tz(new Date(), timeZone);

  const currentDayStart = new Date(
    day.year(),
    day.month(),
    day.date(),
    0,
    0,
    0
  );

  const currentDayEnd = new Date(
    day.year(),
    day.month(),
    day.date(),
    23,
    59,
    59
  );

  return {
    start: currentDayStart,
    end: currentDayEnd,
  };
}

export function getTimeBounds(timeZone, start, end) {
  start = moment.tz(new Date(start), timeZone);
  end = moment.tz(new Date(end), timeZone);

  const currentDayStart = new Date(
    start.year(),
    start.month(),
    start.date(),
    0,
    0,
    0
  );

  const currentDayEnd = new Date(
    end.year(),
    end.month(),
    end.date(),
    23,
    59,
    59
  );

  return {
    start: currentDayStart,
    end: currentDayEnd,
  };
}

export function getDaysBetweenDates(date1, date2, timezone) {
  const start = moment.tz(date1, timezone).startOf('day');
  const end = moment.tz(date2, timezone).startOf('day');

  return Math.abs(end.diff(start, 'days'));
}
