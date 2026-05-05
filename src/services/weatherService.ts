export interface WeatherData {
    name: string;
    main: { temp: number };
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

const CACHE_KEY = 'gym_weather_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

class WeatherService {
    async getWeather(apiKey: string, city: string): Promise<WeatherResponse> {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                    return {
                        current: parsed.current,
                        forecast: parsed.forecast
                    };
                }
            } catch (e) {
                console.warn('Weather cache invalid');
            }
        }

        try {
            // Fetch Current Weather
            const currentRes = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=ru&appid=${apiKey}`
            );
            if (!currentRes.ok) throw new Error('Weather API Error');
            const currentData = await currentRes.json();

            // Fetch Forecast (5 days / 3 hour steps)
            const forecastRes = await fetch(
                `https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&lang=ru&appid=${apiKey}`
            );
            if (!forecastRes.ok) throw new Error('Forecast API Error');
            const forecastRaw = await forecastRes.json();

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

            localStorage.setItem(
                CACHE_KEY,
                JSON.stringify({
                    timestamp: Date.now(),
                    ...response
                })
            );

            return response;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
}

export const weatherService = new WeatherService();
