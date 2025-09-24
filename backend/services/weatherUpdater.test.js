import { describe, it, expect, beforeEach, afterAll, beforeAll } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import dayjs from "dayjs";
import School from "../models/School.js";
import CalendarEvent from "../models/calendarEventModel.js";

// Mock utils/httpClient before importing module under test
jest.unstable_mockModule("../utils/httpClient.js", () => ({
  __esModule: true,
  weatherClient: {
    get: jest.fn(),
  },
}));

// Mock node-cron before importing module under test
jest.unstable_mockModule("node-cron", () => ({
  __esModule: true,
  default: {
    schedule: jest.fn(),
  },
}));

// Dynamically import mocked modules and subject under test
const { weatherClient } = await import("../utils/httpClient.js");
const cron = (await import("node-cron")).default;
const { fetchForecast, updateWeatherForUpcomingEvents, scheduleWeatherUpdates } = await import("./weatherUpdater.js");

describe("Weather Updater Service", () => {
  let mongoServer;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    process.env.OPENWEATHER_API_KEY = "test-api-key";
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    delete process.env.OPENWEATHER_API_KEY;
    process.env.NODE_ENV = originalNodeEnv;
  });

  beforeEach(async () => {
    await School.deleteMany({});
    await CalendarEvent.deleteMany({});
    process.env.OPENWEATHER_API_KEY = "test-api-key"; // Ensure present by default
    jest.clearAllMocks();
  });

  describe("fetchForecast", () => {
    it("returns null if API key is missing", async () => {
      delete process.env.OPENWEATHER_API_KEY;
      const forecast = await fetchForecast(10, 10);
      expect(forecast).toBeNull();
    });

    it("returns forecast data on success", async () => {
      const mockResponse = {
        list: [
          { dt: 1672531200, weather: [{ description: "clear sky" }], main: { temp: 25.5 } },
          { dt: 1672542000, weather: [{ description: "few clouds" }], main: { temp: 26.5 } },
        ],
      };
      weatherClient.get.mockResolvedValue(mockResponse);

      const forecast = await fetchForecast(10, 10);
      expect(weatherClient.get).toHaveBeenCalledWith(expect.stringContaining("lat=10&lon=10"));
      expect(weatherClient.get).toHaveBeenCalledWith(expect.stringContaining("appid="));
      expect(forecast).toEqual(mockResponse.list);
    });

    it("returns null if API call fails", async () => {
      weatherClient.get.mockRejectedValue(new Error("Network error"));
      const forecast = await fetchForecast(10, 10);
      expect(forecast).toBeNull();
    });
  });

  describe("updateWeatherForUpcomingEvents", () => {
    it("updates events for schools with location data", async () => {
      const school = await School.create({ name: "Test School", lat: 10, lng: 10 });
      const eventDate = dayjs().add(1, "day").toDate();
      const event = await CalendarEvent.create({
        school: school._id,
        title: "Test Event",
        description: "desc",
        startDate: eventDate,
        endDate: eventDate,
        createdBy: new mongoose.Types.ObjectId(),
      });

      const mockForecastList = [
        { dt: dayjs(eventDate).unix(), weather: [{ description: "sunny" }], main: { temp: 30 } },
      ];
      weatherClient.get.mockResolvedValue({ list: mockForecastList });

      await updateWeatherForUpcomingEvents();

      const updatedEvent = await CalendarEvent.findById(event._id);
      expect(updatedEvent.weather.description).toBe("sunny");
      expect(updatedEvent.weather.temp).toBe(30);
      expect(updatedEvent.weather.source).toBe("forecast");
    });

    it("does not update if school has no location", async () => {
      const school = await School.create({ name: "No Location School" });
      const event = await CalendarEvent.create({
        school: school._id,
        title: "Test Event",
        description: "desc",
        startDate: new Date(),
        endDate: new Date(),
        createdBy: new mongoose.Types.ObjectId(),
      });

      await updateWeatherForUpcomingEvents();

      const notUpdatedEvent = await CalendarEvent.findById(event._id);
      expect(notUpdatedEvent.weather || {}).toEqual({});
      expect(weatherClient.get).not.toHaveBeenCalled();
    });

    it("does not update events that already have a 'forecast' source", async () => {
      const school = await School.create({ name: "Test School", lat: 10, lng: 10 });
      const eventDate = dayjs().add(1, "day").toDate();
      const event = await CalendarEvent.create({
        school: school._id,
        title: "Test Event",
        description: "desc",
        startDate: eventDate,
        endDate: eventDate,
        createdBy: new mongoose.Types.ObjectId(),
        weather: { description: "old data", temp: 25, source: "forecast" },
      });

      const mockForecastList = [
        { dt: dayjs(eventDate).unix(), weather: [{ description: "new data" }], main: { temp: 30 } },
      ];
      weatherClient.get.mockResolvedValue({ list: mockForecastList });

      await updateWeatherForUpcomingEvents();

      const notUpdatedEvent = await CalendarEvent.findById(event._id);
      expect(notUpdatedEvent.weather.description).toBe("old data");
    });

    it("does not call weather API if no schools have location data", async () => {
      await School.create({ name: "No Location School" });
      await updateWeatherForUpcomingEvents();
      expect(weatherClient.get).not.toHaveBeenCalled();
    });
  });

  describe("scheduleWeatherUpdates", () => {
    it("does not schedule in test environment", () => {
      process.env.NODE_ENV = "test";
      process.env.OPENWEATHER_API_KEY = "test-api-key";
      scheduleWeatherUpdates();
      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it("schedules when API key present and not test env", () => {
      process.env.NODE_ENV = "development";
      process.env.OPENWEATHER_API_KEY = "test-api-key";
      process.env.NOTIFICATION_CRON = "0 6 * * *";
      scheduleWeatherUpdates();
      expect(cron.schedule).toHaveBeenCalledWith("0 6 * * *", expect.any(Function));
      delete process.env.NOTIFICATION_CRON;
    });

    it("does not schedule when API key missing", () => {
      process.env.NODE_ENV = "development";
      delete process.env.OPENWEATHER_API_KEY;
      scheduleWeatherUpdates();
      expect(cron.schedule).not.toHaveBeenCalled();
    });
  });
});
