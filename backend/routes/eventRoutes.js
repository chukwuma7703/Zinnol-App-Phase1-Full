import express from 'express';
const router = express.Router();
import { protect } from '../middleware/authMiddleware.js';
import Event from '../models/Event.js';
import getWeatherData from '../weatherUtils.js';
import asyncHandler from "express-async-handler";

//@desc  Get all events with weather data
//@route  GET /api/events
//@access Private
router.get('/', protect, asyncHandler(async (req, res) => {
  try {
    // Fetch events from the database, possibly filtered by user or school
    const events = await Event.find({ createdBy: req.user._id });

    // Fetch weather data for the location of each event
    const eventsWithWeather = await Promise.all(events.map(async event => {
      const weather = event.location ? await getWeatherData(event.location) : null;
      return {
        ...event.toObject(), // Convert Mongoose document to plain object
        weather: weather
      };
    }));

    res.status(200).json(eventsWithWeather);
  } catch (error) {
    console.error("Error fetching events with weather:", error);
    res.status(500).json({ message: "Failed to fetch events with weather", error: error.message });
  }
}));

export default router;