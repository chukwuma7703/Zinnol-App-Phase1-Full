import cron from "node-cron";
import dayjs from "dayjs";
import CalendarEvent from "../models/calendarEventModel.js";
import School from "../models/School.js";
import utc from "dayjs/plugin/utc.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import { weatherClient } from "../utils/httpClient.js";

dayjs.extend(utc);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/**
 * Fetches daily weather forecast data for given coordinates.
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @returns {Promise<object[]|null>} An array of daily forecast data or null on failure.
 */
export const fetchForecast = async (lat, lon) => {
  const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
  if (!lat || !lon || !OPENWEATHER_API_KEY) {
    console.warn('Weather API: Missing coordinates or API key');
    return null;
  }

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;

  try {
    const data = await weatherClient.get(url);
    return data.list; // Return the forecast list
  } catch (error) {
    console.error(`Weather API: Failed to fetch forecast for ${lat},${lon}:`, error.message);
  }
  return null;
};

/**
 * Finds upcoming events for schools with coordinates and updates their weather info.
 */
export const updateWeatherForUpcomingEvents = async () => {
  console.log("🌦️ Running weather update job...");

  const today = dayjs().startOf('day');
  const nextWeek = today.add(7, 'day');

  // Find schools that have location data
  const schools = await School.find({ lat: { $ne: null }, lng: { $ne: null } }).lean();

  if (schools.length === 0) {
    console.log("🌦️ No schools with location data found. Skipping weather update.");
    return;
  }

  for (const school of schools) {
    const forecastList = await fetchForecast(school.lat, school.lng);
    if (!forecastList) {
      continue;
    }

    // Find all events for this school in the next week
    const eventsToUpdate = await CalendarEvent.find({
      school: school._id,
      startDate: { $gte: today.toDate(), $lt: nextWeek.toDate() },
      // Only update if weather data is missing or from a non-forecast source
      $or: [{ weather: { $exists: false } }, { "weather.source": { $ne: "forecast" } }],
    });

    for (const event of eventsToUpdate) {
      // Find the closest forecast for the event's start date
      const eventDateString = dayjs(event.startDate).utc().format('YYYY-MM-DD');
      const relevantForecast = forecastList.find(f =>
        dayjs.unix(f.dt).utc().format('YYYY-MM-DD') === eventDateString
      );

      if (relevantForecast) {
        event.weather = {
          description: relevantForecast.weather[0].description,
          temp: Math.round(relevantForecast.main.temp),
          source: 'forecast',
        };
        await event.save();
        console.log(`Updated weather for event ${event._id} at ${school.name}`);
      }
    }
  }
  console.log(`🌦️ Weather update job finished. Processed ${schools.length} schools.`);
};

/**
 * Schedules the weather update job to run every hour.
 */
export const scheduleWeatherUpdates = () => {
  const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
  // Don't run in test environment
  if (process.env.NODE_ENV !== 'test' && OPENWEATHER_API_KEY) {
    // Use the schedule from .env, or default to every hour
    const cronSchedule = process.env.NOTIFICATION_CRON || '0 * * * *';
    cron.schedule(cronSchedule, updateWeatherForUpcomingEvents);
    console.log("✅ Weather update service scheduled to run hourly.");
  } else if (!OPENWEATHER_API_KEY) {
    console.warn("⚠️ OPENWEATHER_API_KEY not set. Weather updates are disabled.");
  }
};

// This line causes the side effect on import and should be removed.
// The scheduling is correctly handled in server.js.
