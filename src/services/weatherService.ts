export interface WeatherData {
    name: string;
    main: { 
        temp: number;
        feels_like?: number;
        humidity?: number;
    };
    wind?: {
        speed?: number;
    };
    weather: Array<{ icon: string; description: string }>;
}

export interface ForecastItem {
    dt: number;
    dt_txt: string;
    main: { temp: number };
    weather: Array<{ icon: string; description: string }>;
}

export interface WeatherResponse {
    current: WeatherData;
    forecast: ForecastItem[];
}

import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';

const CACHE_KEY = 'gym_weather_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

class WeatherService {
    async getWeather(apiKey: string, city: string, signal?: AbortSignal): Promise<WeatherResponse> {
        const cached = safeLocalStorageGet(CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                    return {
                        current: parsed.current,
                        forecast: parsed.forecast
                    };
                }
            } catch {
                console.warn('Weather cache invalid');
            }
        }

        try {
            // Fetch Current Weather
            const currentRes = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=ru&appid=${apiKey}`,
                { signal }
            );
            if (!currentRes.ok) throw new Error('Weather API Error');
            const currentData = await currentRes.json();
            if (!currentData?.name || typeof currentData?.main?.temp !== 'number' || !Array.isArray(currentData?.weather)) {
                throw new Error('Invalid weather API response structure');
            }

            // Fetch Forecast (5 days / 3 hour steps)
            const forecastRes = await fetch(
                `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&lang=ru&appid=${apiKey}`,
                { signal }
            );
            if (!forecastRes.ok) throw new Error('Forecast API Error');
            const forecastRaw = await forecastRes.json();
            if (!Array.isArray(forecastRaw?.list)) {
                throw new Error('Invalid forecast API response structure');
            }

            // Process Forecast: Extract daily data (approx at 12:00 or closest)
            const dailyForecast: ForecastItem[] = [];
            const seenDates = new Set();
            const todayDate = new Date().toISOString().split('T')[0];

            for (const item of forecastRaw.list) {
                const date = item.dt_txt.split(' ')[0];
                if (date !== todayDate && !seenDates.has(date)) {
                    dailyForecast.push(item);
                    seenDates.add(date);
                    if (dailyForecast.length >= 3) break;
                }
            }

            const response = {
                current: currentData,
                forecast: dailyForecast
            };

            safeLocalStorageSet(
                CACHE_KEY,
                JSON.stringify({
                    timestamp: Date.now(),
                    ...response
                })
            );

            return response;
        } catch (err) {
            // AbortController при размонтировании (React Strict Mode) — не ошибка
            if ((err as Error)?.name === 'AbortError') {
                throw err;
            }
            console.error(err);
            throw err;
        }
    }
}

export const weatherService = new WeatherService();
