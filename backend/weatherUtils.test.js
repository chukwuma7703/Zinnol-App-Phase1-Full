import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.mock('node-fetch', () => ({ __esModule: true, default: jest.fn() }));
import fetch from 'node-fetch';
import getWeatherData from './weatherUtils.js';

const mockFetch = fetch; // alias for clarity

describe("getWeatherData", () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it("should return weather data on successful API call", async () => {
        mockFetch.mockResolvedValue({
            json: () => Promise.resolve({
                cod: 200,
                main: { temp: 25 },
                weather: [{ description: "Sunny" }],
                name: "New York",
                sys: { country: "US" }
            })
        });

        const weatherData = await getWeatherData("New York");
        expect(weatherData).toEqual({
            temperature: 25,
            description: "Sunny",
            city: "New York",
            country: "US"
        });
    });

    it("should return null on API error", async () => {
        mockFetch.mockResolvedValue({
            json: () => Promise.resolve({
                cod: 404,
                message: "City not found"
            })
        });

        const weatherData = await getWeatherData("InvalidCity");
        expect(weatherData).toBeNull();
    });

    it("should handle fetch errors gracefully", async () => {
        mockFetch.mockRejectedValue(new Error("Network error"));

        const weatherData = await getWeatherData("SomeCity");
        expect(weatherData).toBeNull();
    });
});