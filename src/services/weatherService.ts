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
import { logger } from '../utils/logger';

const CACHE_KEY = 'gym_weather_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/** Open-Meteo weather_code → OpenWeather-like icon code + ru description */
const mapOpenMeteoCode = (code: number): { icon: string; description: string } => {
    if (code === 0) return { icon: '01d', description: 'Ясно' };
    if (code <= 3) return { icon: '02d', description: 'Переменная облачность' };
    if (code <= 48) return { icon: '50d', description: 'Туман' };
    if (code <= 57) return { icon: '09d', description: 'Морось' };
    if (code <= 67) return { icon: '10d', description: 'Дождь' };
    if (code <= 77) return { icon: '13d', description: 'Снег' };
    if (code <= 82) return { icon: '09d', description: 'Ливень' };
    if (code <= 86) return { icon: '13d', description: 'Снегопад' };
    if (code <= 99) return { icon: '11d', description: 'Гроза' };
    return { icon: '03d', description: 'Облачно' };
};

class WeatherService {
    private readCache(): WeatherResponse | null {
        const cached = safeLocalStorageGet(CACHE_KEY);
        if (!cached) return null;
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                return { current: parsed.current, forecast: parsed.forecast };
            }
        } catch {
            logger.warn('Weather cache invalid');
        }
        return null;
    }

    private writeCache(response: WeatherResponse) {
        safeLocalStorageSet(
            CACHE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                ...response
            })
        );
    }

    /** Бесплатный Open-Meteo без API-ключа */
    async getWeatherOpenMeteo(city: string, signal?: AbortSignal): Promise<WeatherResponse> {
        const cityName = (city || 'Minsk').split(',')[0].trim() || 'Minsk';
        const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=ru&format=json`,
            { signal }
        );
        if (!geoRes.ok) throw new Error('Geocoding failed');
        const geo = await geoRes.json();
        const place = geo?.results?.[0];
        if (!place) throw new Error('City not found');

        const lat = place.latitude;
        const lon = place.longitude;
        const label = place.name || cityName;

        const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max&timezone=auto&forecast_days=4&wind_speed_unit=ms`,
            { signal }
        );
        if (!wxRes.ok) throw new Error('Open-Meteo failed');
        const wx = await wxRes.json();
        const cur = wx.current;
        if (typeof cur?.temperature_2m !== 'number') throw new Error('Invalid Open-Meteo response');

        const mapped = mapOpenMeteoCode(Number(cur.weather_code ?? 0));
        const current: WeatherData = {
            name: label,
            main: {
                temp: cur.temperature_2m,
                feels_like: cur.apparent_temperature,
                humidity: cur.relative_humidity_2m
            },
            wind: { speed: cur.wind_speed_10m },
            weather: [mapped]
        };

        const forecast: ForecastItem[] = [];
        const times: string[] = wx.daily?.time || [];
        for (let i = 1; i < times.length && forecast.length < 3; i++) {
            const code = Number(wx.daily.weather_code?.[i] ?? 0);
            const m = mapOpenMeteoCode(code);
            const dateStr = times[i];
            forecast.push({
                dt: Math.floor(new Date(dateStr).getTime() / 1000),
                dt_txt: `${dateStr} 12:00:00`,
                main: { temp: Number(wx.daily.temperature_2m_max?.[i] ?? 0) },
                weather: [m]
            });
        }

        return { current, forecast };
    }

    async getWeather(apiKey: string | undefined | null, city: string, signal?: AbortSignal): Promise<WeatherResponse> {
        const cached = this.readCache();
        if (cached) return cached;

        // Без ключа — сразу Open-Meteo
        if (!apiKey) {
            const free = await this.getWeatherOpenMeteo(city, signal);
            this.writeCache(free);
            return free;
        }

        try {
            const currentRes = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=ru&appid=${apiKey}`,
                { signal }
            );
            if (!currentRes.ok) throw new Error('Weather API Error');
            const currentData = await currentRes.json();
            if (!currentData?.name || typeof currentData?.main?.temp !== 'number' || !Array.isArray(currentData?.weather)) {
                throw new Error('Invalid weather API response structure');
            }

            const forecastRes = await fetch(
                `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&lang=ru&appid=${apiKey}`,
                { signal }
            );
            if (!forecastRes.ok) throw new Error('Forecast API Error');
            const forecastRaw = await forecastRes.json();
            if (!Array.isArray(forecastRaw?.list)) {
                throw new Error('Invalid forecast API response structure');
            }

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

            this.writeCache(response);
            return response;
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') {
                throw err;
            }
            logger.warn('OpenWeather failed, falling back to Open-Meteo', err);
            const free = await this.getWeatherOpenMeteo(city, signal);
            this.writeCache(free);
            return free;
        }
    }
}

export const weatherService = new WeatherService();
