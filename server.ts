import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { enrichItineraryWithOverpass, enrichSingleStopWithOverpass } from './server/overpassService';

dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON body parsing with large limit for camera images
app.use(express.json({ limit: '25mb' }));

// Helper to get Gemini AI instance safely
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not configured in environment variables');
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Weather code mapping for Open-Meteo
function interpretWmoCode(code: number): { condition: string; isRaining: boolean } {
  if (code === 0) return { condition: 'Clear Sky', isRaining: false };
  if (code === 1) return { condition: 'Mainly Clear', isRaining: false };
  if (code === 2) return { condition: 'Partly Cloudy', isRaining: false };
  if (code === 3) return { condition: 'Overcast', isRaining: false };
  if (code === 45 || code === 48) return { condition: 'Foggy', isRaining: false };
  if (code >= 51 && code <= 55) return { condition: 'Drizzle', isRaining: true };
  if (code >= 61 && code <= 65) return { condition: 'Rain', isRaining: true };
  if (code >= 66 && code <= 67) return { condition: 'Freezing Rain', isRaining: true };
  if (code >= 71 && code <= 77) return { condition: 'Snow', isRaining: false };
  if (code >= 80 && code <= 82) return { condition: 'Rain Showers', isRaining: true };
  if (code >= 95 && code <= 99) return { condition: 'Thunderstorm', isRaining: true };
  return { condition: 'Cloudy', isRaining: false };
}

const ALLOWED_GEMINI_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
];

function resolveModelId(requestedModel?: any): string {
  if (typeof requestedModel === 'string' && ALLOWED_GEMINI_MODELS.includes(requestedModel)) {
    return requestedModel;
  }
  return 'gemini-3.5-flash';
}

// 1. Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'MatterMap Orchestrator' });
});

// 2. Real-time Live Weather endpoint using Open-Meteo
app.get('/api/weather', async (req, res) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : 35.6595;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : 139.7005;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid latitude or longitude parameters' });
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&timezone=auto`;
    
    const response = await fetch(weatherUrl);
    if (!response.ok) {
      throw new Error(`Open-Meteo responded with status ${response.status}`);
    }

    const data = await response.json();
    const current = data.current || {};
    const weatherInfo = interpretWmoCode(current.weather_code ?? 0);

    const weatherResult = {
      tempC: Math.round(current.temperature_2m ?? 20),
      feelsLikeC: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 20),
      condition: weatherInfo.condition,
      weatherCode: current.weather_code ?? 0,
      isRaining: weatherInfo.isRaining || (current.precipitation ?? 0) > 0.1 || (current.rain ?? 0) > 0,
      precipitationMm: current.precipitation ?? 0,
      windSpeedKmh: Math.round(current.wind_speed_10m ?? 10),
      humidity: Math.round(current.relative_humidity_2m ?? 50),
      updatedAt: new Date().toISOString(),
    };

    res.json(weatherResult);
  } catch (error: any) {
    console.error('Weather API error:', error.message);
    res.status(502).json({
      error: 'Weather service temporarily unavailable',
      message: 'Could not fetch live weather. Defaulting to standard conditions.',
      details: error.message,
    });
  }
});

// 3. Reverse Geocode endpoint
app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : 35.6595;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : 139.7005;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
    const response = await fetch(geoUrl, {
      headers: {
        'User-Agent': 'MatterMap/1.0 (travel-planner)',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.suburb || addr.neighbourhood || addr.county || 'Current Location';
      const country = addr.country || '';
      return res.json({ city, country, displayName: data.display_name });
    }

    res.json({ city: `GPS (${lat.toFixed(2)}, ${lng.toFixed(2)})`, country: '' });
  } catch (err: any) {
    console.warn('Reverse geocode warning:', err.message);
    res.json({ city: 'Current Location', country: '' });
  }
});

// 4. Gemini AI Live Renegotiation Engine (/api/replan)
app.post('/api/replan', async (req, res) => {
  try {
    const {
      itinerary,
      eligibleStopIds,
      targetItemId,
      currentWeather,
      userPulse,
      currentLocation,
      simulatedDelayMins,
      travelPreferences,
      contextPrompt,
      language = 'en',
      model: requestedModel,
    } = req.body;

    const model = resolveModelId(requestedModel);
    const isVi = language === 'vi';

    // Input validation
    if (!itinerary || !Array.isArray(itinerary) || itinerary.length === 0) {
      return res.status(400).json({
        error: 'Invalid itinerary',
        message: isVi
          ? 'Không thể đàm phán lại một lịch trình trống. Vui lòng cung cấp kế hoạch ngày hợp lệ.'
          : 'Cannot renegotiate an empty itinerary. Please provide a valid day plan.',
      });
    }

    // Filter strictly to candidate stops that are CURRENT or UPCOMING (exclude completed or already passed stops)
    const eligibleStops = itinerary.filter((i: any) => {
      if (i.status === 'completed' || i.isCompleted || i.isPassed) return false;
      if (Array.isArray(eligibleStopIds) && eligibleStopIds.length > 0) {
        return eligibleStopIds.includes(i.id);
      }
      return true;
    });

    const completedOrPassedStops = itinerary.filter(
      (i: any) => i.status === 'completed' || i.isCompleted || i.isPassed
    );

    // If there are no eligible stops left in the itinerary, maintain plan
    if (eligibleStops.length === 0) {
      return res.json({
        status: 'MAINTAIN_PLAN',
        trigger_reason: isVi
          ? 'Tất cả các điểm dừng đã kết thúc hoặc hoàn thành.'
          : 'All itinerary stops have already concluded or been completed.',
        justification: isVi
          ? 'Không còn điểm dừng sắp tới nào trong lịch trình để thay thế.'
          : 'No upcoming stops remain on the current schedule to swap.',
      });
    }

    const activeStop =
      eligibleStops.find((i: any) => i.id === targetItemId) ||
      eligibleStops.find((i: any) => i.status === 'active') ||
      eligibleStops.find((i: any) => i.status === 'upcoming') ||
      eligibleStops[0];
    const locationName = currentLocation?.name || 'Local Area';

    const ai = getGeminiClient();
    if (!ai) {
      // Graceful fallback when API key is not configured
      return res.json({
        status: 'PROPOSE_SWAP',
        trigger_reason: isVi
          ? 'Tín hiệu thời gian thực: Thời tiết và lịch trình cần được điều chỉnh phù hợp.'
          : 'Live signal trigger: Weather and schedule constraint require adaptation.',
        skipped_place: activeStop?.title || (isVi ? 'Điểm ngoài trời kế tiếp' : 'Next Outdoor Stop'),
        target_item_id: activeStop?.id,
        proposed_swap: {
          place_name: isVi
            ? `Không gian trà & ẩm thực thủ công, ${locationName.split(',')[0]}`
            : `Artisanal Tea & Food Pavilion, ${locationName.split(',')[0]}`,
          travel_time_mins: 6,
          category: 'food',
          indoor_outdoor: 'indoor',
          vibe: isVi ? 'Ấm cúng, khô ráo & thư thái' : 'Warm, dry & serene retreat',
          estimated_duration_mins: 60,
          description: isVi
            ? 'Không gian ấm áp có điều hòa với các món đặc sản địa phương, trà thủ công và chỗ ngồi thoải mái.'
            : 'A cozy climate-controlled space with regional specialties, artisanal tea, and dry comfort.',
        },
        justification: isVi
          ? 'Thời tiết và nhịp độ hiện tại đề xuất dừng chân thư giãn trong nhà cách đây 6 phút.'
          : 'Current weather and pacing signals suggest an indoor comfort pause 6 minutes away.',
      });
    }

    const systemInstruction = `Role: You are the MatterMap Live Re-planner. You are a decisive, logical, and highly empathetic travel companion.

Objective: Evaluate the user's current itinerary against real-time signals (weather, crowds, time remaining, and the user's mood). If the plan is compromised, output a single, highly-justified itinerary swap.

Rules:
1. DYNAMIC REASONING: Analyze the exact live context provided (weather conditions, rain, user mood/pulse, delays, category preferences).
2. NO LISTS: Never suggest multiple options. Provide exactly ONE strong, data-backed pivot.
3. CONSTRAINTS FIRST: Strictly respect time budgets and current location.
4. WEATHER LOGIC: If it is raining or precipitation > 0mm, any currently active or upcoming OUTDOOR activity (parks, rooftops, open gardens, long walking promenades) MUST be replaced with a compelling INDOOR alternative (covered arcades, museum wings, covered food halls, tea houses, boutique craft studios).
5. MOOD LOGIC: If user pulse is 'tired' or 'cold_wet' or 'hungry', adapt immediately to low-exertion, cozy, nearby venues.
6. STRICT IMMUTABILITY OF PASSED/COMPLETED STOPS: You are strictly forbidden from choosing any completed or already-passed stop as skipped_place or target_item_id. Swapping is ONLY permitted for the currently active or upcoming stops listed under ELIGIBLE ACTIVE/UPCOMING STOPS.
7. LANGUAGE: ${isVi ? 'Vietnamese (Tiếng Việt). Generate trigger_reason, justification, proposed_swap place_name, description, and vibe in fluent, natural Vietnamese.' : 'English'}`;

    const promptPayload = `
CURRENT TRIP STATE:
- City / Location: ${locationName} (${currentLocation?.lat || 0}, ${currentLocation?.lng || 0})
- Real-time Weather: Temperature ${currentWeather?.tempC ?? 20}°C (Feels like ${currentWeather?.feelsLikeC ?? 20}°C), Condition: ${currentWeather?.condition ?? 'Clear'}, Is Raining: ${currentWeather?.isRaining ? 'YES (Active Rain)' : 'NO'}, Precipitation: ${currentWeather?.precipitationMm ?? 0}mm, Wind: ${currentWeather?.windSpeedKmh ?? 10}km/h
- User Pulse / State: ${userPulse || 'Normal'}
- Running Delay: ${simulatedDelayMins ? `${simulatedDelayMins} minutes behind schedule` : 'On schedule'}
- Travel Preferences / History: ${JSON.stringify(travelPreferences || {})}
- User Trigger / Spoken Request / Alert Context: ${contextPrompt || 'Routine live signal check'}

ELIGIBLE ACTIVE & UPCOMING STOPS (ONLY these stops may be swapped or chosen as skipped_place / target_item_id):
${JSON.stringify(eligibleStops, null, 2)}

COMPLETED & PASSED STOPS (FORBIDDEN: Must NEVER be modified, skipped, or swapped):
${JSON.stringify(completedOrPassedStops.map((i: any) => ({ id: i.id, title: i.title, time: i.time, status: i.status })), null, 2)}

TASK:
Analyze if any eligible active or upcoming stop needs a swap.
If rain, fatigue, extreme lines, delays, or closed hours threaten the schedule, set status to "PROPOSE_SWAP" and provide the single best replacement venue in the same neighborhood for one of the ELIGIBLE STOPS.
If the current plan is still optimal, return "MAINTAIN_PLAN".
`;

    const response = await ai.models.generateContent({
      model,
      contents: promptPayload,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: {
              type: Type.STRING,
              enum: ['MAINTAIN_PLAN', 'PROPOSE_SWAP'],
              description: 'Whether to keep the existing schedule or pivot to a single replacement venue.',
            },
            trigger_reason: {
              type: Type.STRING,
              description: 'Short explanation of why the plan is breaking or maintaining.',
            },
            skipped_place: {
              type: Type.STRING,
              description: 'Exact title or name of the venue being skipped/replaced.',
            },
            target_item_id: {
              type: Type.STRING,
              description: 'ID of the itinerary item being replaced (must match an eligible stop ID).',
            },
            proposed_swap: {
              type: Type.OBJECT,
              properties: {
                place_name: { type: Type.STRING, description: 'Specific, authentic venue name in the area.' },
                place_id: { type: Type.STRING, description: 'Optional place id or slug' },
                travel_time_mins: { type: Type.INTEGER, description: 'Walking/transit minutes from current stop' },
                lat: { type: Type.NUMBER, description: 'Latitude coordinate of the replacement venue' },
                lng: { type: Type.NUMBER, description: 'Longitude coordinate of the replacement venue' },
                category: {
                  type: Type.STRING,
                  enum: ['sightseeing', 'food', 'coffee', 'walk', 'museum', 'shopping', 'relaxation', 'nature', 'nightlife'],
                },
                description: { type: Type.STRING, description: 'What to experience at this replacement stop.' },
                indoor_outdoor: { type: Type.STRING, enum: ['indoor', 'outdoor'] },
                vibe: { type: Type.STRING, description: 'Atmosphere descriptor' },
                estimated_duration_mins: { type: Type.INTEGER, description: 'Duration in minutes' },
              },
              required: ['place_name', 'travel_time_mins', 'category', 'description', 'indoor_outdoor', 'vibe', 'estimated_duration_mins'],
            },
            justification: {
              type: Type.STRING,
              description: 'A one-sentence, empathetic explanation of why this swap is the best choice right now.',
            },
          },
          required: ['status', 'trigger_reason', 'justification'],
        },
      },
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch (parseErr) {
      console.warn('Malformed JSON from Gemini replan:', parseErr);
    }

    if (!parsed.status) {
      parsed.status = 'MAINTAIN_PLAN';
      parsed.trigger_reason = 'Current schedule remains balanced for the environment.';
      parsed.justification = 'All stops align with current pacing and conditions.';
    }

    // Safeguard: Ensure target_item_id and skipped_place never map to a passed or completed stop
    if (parsed.status === 'PROPOSE_SWAP') {
      const isTargetValid = eligibleStops.some((i: any) =>
        (parsed.target_item_id && i.id === parsed.target_item_id) ||
        (parsed.skipped_place && i.title.toLowerCase().trim() === parsed.skipped_place.toLowerCase().trim())
      );

      if (!isTargetValid) {
        parsed.target_item_id = activeStop?.id;
        parsed.skipped_place = activeStop?.title || 'Current Scheduled Stop';
      }
    }

    if (parsed.status === 'PROPOSE_SWAP' && parsed.proposed_swap) {
      const cityLocName = locationName.split(',')[0].trim();
      const refLat = currentLocation?.lat || 0;
      const refLng = currentLocation?.lng || 0;
      parsed.proposed_swap = await enrichSingleStopWithOverpass(
        parsed.proposed_swap,
        refLat,
        refLng,
        cityLocName
      );
    }

    res.json(parsed);
  } catch (error: any) {
    console.error('Replan error:', error.message);
    // Graceful structured fallback
    const cityName = req.body?.currentLocation?.name?.split(',')[0] || 'Local';
    res.json({
      status: 'PROPOSE_SWAP',
      trigger_reason: 'Live condition shift requires sheltered indoor adaptation.',
      skipped_place: req.body?.itinerary?.find((i: any) => i.status === 'active')?.title || 'Current Scheduled Stop',
      proposed_swap: {
        place_name: `Cozy Artisanal Food & Tea Lounge, ${cityName}`,
        travel_time_mins: 5,
        category: 'food',
        indoor_outdoor: 'indoor',
        vibe: 'Warm, dry & comforting haven',
        estimated_duration_mins: 60,
        description: 'Heated indoor lounge with local specialties, artisan roast, and quiet seating.',
      },
      justification: 'Severe weather or pacing shifts suggest moving indoors to keep the experience enjoyable.',
    });
  }
});

// 5. Multimodal Vision Wait-Time & Crowd Estimation (/api/vision-crowd-check)
app.post('/api/vision-crowd-check', async (req, res) => {
  try {
    const { imageBase64, mimeType, venueName, timeBudgetMins, locationContext, language = 'en', model: requestedModel } = req.body;
    const model = resolveModelId(requestedModel);
    const isVi = language === 'vi';

    // Input validation
    if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 50) {
      return res.status(400).json({
        error: 'Missing image',
        message: isVi ? 'Vui lòng cung cấp ảnh hợp lệ để phân tích mật độ hàng đợi.' : 'Please provide a valid photo of the venue or line to analyze crowd density.',
      });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        queueLengthEstimate: isVi ? 'Khoảng 85-110 người đang xếp hàng' : 'Approx. 85-110 people in line',
        estimatedWaitMins: 65,
        crowdDensity: 'heavy',
        breaksBudget: true,
        visualAnalysis: isVi ? 'Hình ảnh cho thấy hàng đợi kéo dài ra vỉa hè với tốc độ di chuyển chậm.' : 'Image shows a wrapped exterior queue spilling into the street with bottleneck throughput.',
        swapDecision: {
          status: 'PROPOSE_SWAP',
          trigger_reason: isVi
            ? `Phân tích hình ảnh xác nhận hàng đợi kéo dài 65 phút tại ${venueName || 'địa điểm'}, vượt quá quỹ thời gian ${timeBudgetMins || 45} phút của bạn.`
            : `Visual crowd analysis confirms a 65-minute queue at ${venueName || 'venue'}, exceeding your ${timeBudgetMins || 45}-min time budget.`,
          skipped_place: venueName || (isVi ? 'Địa điểm hiện tại' : 'Current Venue'),
          proposed_swap: {
            place_name: isVi ? 'Phòng trưng bày nghệ thuật & Sân vườn kiến trúc gần đây' : 'Nearby Architectural Cloister & Courtyard Gallery',
            travel_time_mins: 4,
            category: 'museum',
            indoor_outdoor: 'indoor',
            vibe: isVi ? 'Không gian yên bình vào cửa ngay' : 'Zero-wait peaceful discovery',
            estimated_duration_mins: 50,
            description: isVi ? 'Vòm kiến trúc lịch sử và không gian triển lãm tĩnh lặng không phải chờ đợi.' : 'Historic arches and quiet modern exhibit with immediate walk-in access.',
          },
          justification: isVi
            ? `Thời gian chờ 65 phút làm vỡ lịch trình; phòng trưng bày này chỉ cách 4 phút và vào cửa ngay.`
            : `A 65-minute queue breaks your afternoon schedule; this hidden gallery is 4 minutes away with zero wait.`,
        },
      });
    }

    // Clean base64 string
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const promptText = `
You are the MatterMap Vision Crowd Estimator.
Analyze this photo taken by the traveler right now at "${venueName || 'the current venue'}".
Traveler Location: ${locationContext || 'Urban city center'}
Traveler Time Budget for this stop: ${timeBudgetMins || 45} minutes.
Language Output: ${isVi ? 'Vietnamese (Tiếng Việt). All descriptions, analyses, and swap details must be in natural Vietnamese.' : 'English'}.

Instructions:
1. Visually inspect the crowd density, queue length, barricades, ticketing congestion, and line movement speed.
2. Estimate the realistic wait time in minutes.
3. Compare estimated wait time with the traveler's time budget (${timeBudgetMins || 45} mins).
4. If the wait time exceeds the budget or line is heavy, propose a compelling, immediate walk-in nearby alternative.
`;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            queueLengthEstimate: { type: Type.STRING, description: 'Visual queue count or description' },
            estimatedWaitMins: { type: Type.INTEGER, description: 'Estimated wait time in minutes' },
            crowdDensity: { type: Type.STRING, enum: ['low', 'moderate', 'heavy', 'extreme'] },
            breaksBudget: { type: Type.BOOLEAN, description: 'True if wait exceeds available time budget' },
            visualAnalysis: { type: Type.STRING, description: '2-sentence visual proof of what you see in the photo' },
            swapDecision: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, enum: ['MAINTAIN_PLAN', 'PROPOSE_SWAP'] },
                trigger_reason: { type: Type.STRING },
                skipped_place: { type: Type.STRING },
                proposed_swap: {
                  type: Type.OBJECT,
                  properties: {
                    place_name: { type: Type.STRING },
                    travel_time_mins: { type: Type.INTEGER },
                    category: {
                      type: Type.STRING,
                      enum: ['sightseeing', 'food', 'coffee', 'walk', 'museum', 'shopping', 'relaxation', 'nature', 'nightlife'],
                    },
                    description: { type: Type.STRING },
                    indoor_outdoor: { type: Type.STRING, enum: ['indoor', 'outdoor'] },
                    vibe: { type: Type.STRING },
                    estimated_duration_mins: { type: Type.INTEGER },
                  },
                  required: ['place_name', 'travel_time_mins', 'category', 'description', 'indoor_outdoor', 'vibe', 'estimated_duration_mins'],
                },
                justification: { type: Type.STRING },
              },
              required: ['status', 'trigger_reason', 'justification'],
            },
          },
          required: ['queueLengthEstimate', 'estimatedWaitMins', 'crowdDensity', 'breaksBudget', 'visualAnalysis'],
        },
      },
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch (pe) {
      console.warn('Malformed JSON from Gemini vision:', pe);
    }

    if (!parsed.queueLengthEstimate) {
      parsed = {
        queueLengthEstimate: 'Moderate queue observed',
        estimatedWaitMins: 20,
        crowdDensity: 'moderate',
        breaksBudget: false,
        visualAnalysis: 'The queue appears steady with active entry progression.',
      };
    }

    res.json(parsed);
  } catch (error: any) {
    console.error('Vision analysis error:', error.message);
    res.status(502).json({
      error: 'Vision analysis error',
      message: "Couldn't complete visual crowd analysis. Check your connection and try again.",
      details: error.message,
    });
  }
});

// 6. Voice-in-the-Moment NLP Re-planner (/api/voice-pivot)
app.post('/api/voice-pivot', async (req, res) => {
  try {
    const { voiceTranscript, itinerary, currentWeather, currentLocation, language = 'en', model: requestedModel } = req.body;
    const model = resolveModelId(requestedModel);
    const isVi = language === 'vi';

    // Input validation
    if (!voiceTranscript || typeof voiceTranscript !== 'string' || !voiceTranscript.trim()) {
      return res.status(400).json({
        error: 'Missing voice transcript',
        message: isVi ? 'Vui lòng nói hoặc nhập yêu cầu trước khi gửi.' : 'Please speak or type a travel request before submitting.',
      });
    }

    const trimmedTranscript = voiceTranscript.trim();
    const locationName = currentLocation?.name || 'City Center';

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        status: 'PROPOSE_SWAP',
        trigger_reason: isVi ? `Đã xử lý yêu cầu giọng nói: "${trimmedTranscript}"` : `Spoken request processed: "${trimmedTranscript}"`,
        skipped_place: isVi ? 'Điểm ngoài trời dự kiến' : 'Scheduled Outdoor Stop',
        proposed_swap: {
          place_name: isVi ? `Quán mỳ & nước dùng thủ công ấm cúng, ${locationName.split(',')[0]}` : `Cozy Artisanal Noodle & Broth Bar, ${locationName.split(',')[0]}`,
          travel_time_mins: 4,
          category: 'food',
          indoor_outdoor: 'indoor',
          vibe: isVi ? 'Nóng hổi, ấm cúng & thư giãn' : 'Steaming, intimate & comforting',
          estimated_duration_mins: 50,
          description: isVi ? 'Quầy gỗ mộc ấm cúng phục vụ các món ăn đặc sản địa phương nóng sốt.' : 'A welcoming wood-paneled counter serving handmade regional specialties with rich broth.',
        },
        justification: isVi
          ? `Dựa trên yêu cầu của bạn, chúng tôi đã chuyển từ đi bộ ngoài trời sang quán ăn nóng ấm cách đây 4 phút.`
          : `Based on your request, we swapped the outdoor walk for steaming hot bowls 4 minutes away.`,
      });
    }

    const systemInstruction = `Role: You are MatterMap Voice Re-planner.
You receive real-time spoken voice commands and travel complaints from a traveler on the move (e.g. "It's freezing and I'm starving, let's skip the park and find hot food").
Your job is to parse their immediate physiological/emotional need, identify which stop in their day should be replaced, and provide ONE decisive, instant pivot.
Language: ${isVi ? 'Vietnamese (Tiếng Việt). Output trigger_reason, justification, proposed_swap place_name, description, and vibe in fluent Vietnamese.' : 'English'}`;

    const promptText = `
TRAVELER'S SPOKEN WORDS:
"${trimmedTranscript}"

CURRENT ENVIRONMENT:
- Location: ${locationName}
- Weather: ${currentWeather?.tempC ?? 20}°C, ${currentWeather?.condition ?? 'Clear'}, Is Raining: ${currentWeather?.isRaining ? 'YES' : 'NO'}
- Language Target: ${isVi ? 'Vietnamese (Tiếng Việt)' : 'English'}
- Itinerary:
${JSON.stringify(itinerary || [], null, 2)}

Provide the structured swap response according to the schema.
`;

    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['MAINTAIN_PLAN', 'PROPOSE_SWAP'] },
            trigger_reason: { type: Type.STRING },
            skipped_place: { type: Type.STRING },
            proposed_swap: {
              type: Type.OBJECT,
              properties: {
                place_name: { type: Type.STRING },
                travel_time_mins: { type: Type.INTEGER },
                category: {
                  type: Type.STRING,
                  enum: ['sightseeing', 'food', 'coffee', 'walk', 'museum', 'shopping', 'relaxation', 'nature', 'nightlife'],
                },
                description: { type: Type.STRING },
                indoor_outdoor: { type: Type.STRING, enum: ['indoor', 'outdoor'] },
                vibe: { type: Type.STRING },
                estimated_duration_mins: { type: Type.INTEGER },
              },
              required: ['place_name', 'travel_time_mins', 'category', 'description', 'indoor_outdoor', 'vibe', 'estimated_duration_mins'],
            },
            justification: { type: Type.STRING },
          },
          required: ['status', 'trigger_reason', 'justification'],
        },
      },
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch (pe) {
      console.warn('Malformed JSON from Gemini voice:', pe);
    }

    if (!parsed.status) {
      parsed = {
        status: 'PROPOSE_SWAP',
        trigger_reason: `Spoken Traveler Constraint: "${trimmedTranscript}"`,
        skipped_place: 'Current Scheduled Stop',
        proposed_swap: {
          place_name: `Cozy Local Bistro, ${locationName.split(',')[0]}`,
          travel_time_mins: 5,
          category: 'food',
          indoor_outdoor: 'indoor',
          vibe: 'Warm & Welcoming',
          estimated_duration_mins: 50,
          description: 'A comforting indoor retreat serving authentic local dishes.',
        },
        justification: `Adapted to your spoken request: "${trimmedTranscript}".`,
      };
    }

    if (parsed.status === 'PROPOSE_SWAP' && parsed.proposed_swap) {
      const cityLocName = locationName.split(',')[0].trim();
      const refLat = currentLocation?.lat || 0;
      const refLng = currentLocation?.lng || 0;
      parsed.proposed_swap = await enrichSingleStopWithOverpass(
        parsed.proposed_swap,
        refLat,
        refLng,
        cityLocName
      );
    }

    res.json(parsed);
  } catch (error: any) {
    console.error('Voice pivot error:', error.message);
    res.status(502).json({
      error: 'Voice processing error',
      message: "Couldn't reach the AI re-planner — check your connection and try again.",
      details: error.message,
    });
  }
});

function parseTimeToMinutes(t: string): number {
  if (!t || !t.includes(':')) return 9 * 60 + 30;
  const [h, m] = t.split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function formatMinutesToTime(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function getFormattedDateOffset(startDateStr: string, dayIndex: number): { isoDate: string; formattedDate: string } {
  try {
    const base = new Date(startDateStr ? `${startDateStr}T12:00:00Z` : '2026-08-22T12:00:00Z');
    if (isNaN(base.getTime())) {
      const fallback = new Date('2026-08-22T12:00:00Z');
      const d = new Date(fallback.getTime() + dayIndex * 86400000);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        isoDate: d.toISOString().split('T')[0],
        formattedDate: `${months[d.getUTCMonth()]} ${d.getUTCDate()}`,
      };
    }
    const d = new Date(base.getTime() + dayIndex * 86400000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      isoDate: d.toISOString().split('T')[0],
      formattedDate: `${months[d.getUTCMonth()]} ${d.getUTCDate()}`,
    };
  } catch {
    return { isoDate: '2026-08-22', formattedDate: 'Aug 22' };
  }
}

// 7. Custom Itinerary Generation endpoint (/api/generate-itinerary)
app.post('/api/generate-itinerary', async (req, res) => {
  try {
    let {
      destination,
      theme,
      lat,
      lng,
      startTime = '09:30',
      endTime = '18:00',
      numDays = 1,
      startDate = '2026-08-22',
      language = 'en',
      model: requestedModel,
    } = req.body;
    const model = resolveModelId(requestedModel);
    const isVi = language === 'vi';

    // Input validation
    if (!destination || typeof destination !== 'string' || !destination.trim()) {
      return res.status(400).json({
        error: 'Missing destination',
        message: isVi ? 'Vui lòng nhập tên thành phố hoặc khu vực để tạo lịch trình.' : 'Please enter a city or region name to generate your itinerary.',
      });
    }

    destination = destination.trim();
    const daysCount = Math.max(1, Math.min(7, parseInt(numDays, 10) || 1));
    const startMins = parseTimeToMinutes(startTime);
    let endMins = parseTimeToMinutes(endTime);
    if (endMins <= startMins) {
      endMins = Math.min(startMins + 8 * 60, 23 * 60 + 59);
    }
    const totalTimeSpanMins = endMins - startMins;

    // Forward geocode destination if lat/lng not provided
    if (!lat || !lng) {
      try {
        const geoQueryUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          destination
        )}&limit=1`;
        const geoRes = await fetch(geoQueryUrl, {
          headers: { 'User-Agent': 'MatterMap/1.0 (travel-planner)' },
        });
        if (geoRes.ok) {
          const geoList = await geoRes.json();
          if (geoList && geoList.length > 0) {
            lat = parseFloat(geoList[0].lat);
            lng = parseFloat(geoList[0].lon);
          }
        }
      } catch (e: any) {
        console.warn('Geocoding notice:', e.message);
      }
    }

    // Default fallback coordinates if unlocatable
    const finalLat = lat ?? 37.7749;
    const finalLng = lng ?? -122.4194;

    // Fetch live weather for the destination coordinates
    let liveWeather = null;
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${finalLat}&longitude=${finalLng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&timezone=auto`;
      const wRes = await fetch(weatherUrl);
      if (wRes.ok) {
        const wData = await wRes.json();
        const current = wData.current || {};
        const weatherInfo = interpretWmoCode(current.weather_code ?? 0);
        liveWeather = {
          tempC: Math.round(current.temperature_2m ?? 20),
          feelsLikeC: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 20),
          condition: weatherInfo.condition,
          weatherCode: current.weather_code ?? 0,
          isRaining: weatherInfo.isRaining || (current.precipitation ?? 0) > 0.1 || (current.rain ?? 0) > 0,
          precipitationMm: current.precipitation ?? 0,
          windSpeedKmh: Math.round(current.wind_speed_10m ?? 10),
          humidity: Math.round(current.relative_humidity_2m ?? 50),
          city: destination,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (wErr) {
      console.warn('Weather fetch error for new city:', wErr);
    }

    const ai = getGeminiClient();
    const cleanName = destination
      .replace(/^near\s+/i, '')
      .replace(/^current location\s*/i, 'Live Location')
      .split(',')[0]
      .trim();
    const baseName = cleanName || 'Your Destination';

    const dayThemes = [
      'Historic Quarters, Central Plaza & Artisan Brews',
      'Contemporary Culture, Art Pavilions & City Vistas',
      'Culinary Discoveries, Food Halls & Local Markets',
      'Scenic Waterfronts, Botanical Walks & Hidden Cafes',
      'Heritage Architecture, Craft Boutiques & Sunset Overlook',
      'Neighborhood Immersion & Authentic Street Life',
      'Relaxed Panoramic Highlights & Celebratory Dinner',
    ];

    // Helper to generate fallback stops partitioned over the user's start-end time window for each day
    const buildFallbackDay = (dayIdx: number) => {
      const numStops = totalTimeSpanMins >= 360 ? 5 : totalTimeSpanMins >= 240 ? 4 : 3;
      const slotDuration = Math.floor((totalTimeSpanMins - (numStops - 1) * 15) / numStops);
      const dateInfo = getFormattedDateOffset(startDate, dayIdx);

      const templatesByDay = [
        [
          {
            title: `Discovery & Signature Roast in ${baseName}`,
            subtitle: `Sample morning signature brews and orient in the historic central district.`,
            category: 'coffee' as const,
            locationName: `Old Quarter / Heritage Area, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Warm & Artisanal',
            notes: 'Great spot to orient yourself and sample local breakfast specialties.',
          },
          {
            title: `${baseName} Iconic Landmark & Public Plaza`,
            subtitle: `Promenade through renowned plazas, architecture, and heritage grounds.`,
            category: 'sightseeing' as const,
            locationName: `Main Plaza & Heritage Quarter, ${baseName}`,
            indoorOutdoor: 'outdoor' as const,
            vibe: 'Iconic & Open-Air',
            notes: 'Exposed to open sky; ideal for photography and architecture.',
          },
          {
            title: `Regional Gastronomy & Market Hall`,
            subtitle: `Taste authentic regional dishes and culinary specialties crafted by local vendors.`,
            category: 'food' as const,
            locationName: `Central Market Bazaar, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Bustling & Culinary',
            notes: 'Try the house specialties and fresh seasonal bites.',
          },
          {
            title: `Contemporary Art Wing or Scenic Vista`,
            subtitle: `Explore curated galleries or an elevated vista overlooking the cityscape.`,
            category: 'museum' as const,
            locationName: `Art District / Scenic Overlook, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Inspiring & Visual',
            notes: 'Sublime afternoon light and curated cultural immersion.',
          },
          {
            title: `Evening Refreshments & Dining Walk`,
            subtitle: `Conclude with local refreshments and dinner in an intimate neighborhood alleyway.`,
            category: 'nightlife' as const,
            locationName: `Evening Waterfront / Promenade, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Atmospheric & Relaxed',
            notes: 'Vibrant local evening energy and relaxed dining.',
          },
        ],
        [
          {
            title: `Morning Bakery & Neighborhood Cafe`,
            subtitle: `Enjoy freshly baked regional pastries and single-origin coffee in an authentic quarter.`,
            category: 'coffee' as const,
            locationName: `Artisan Row, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Cozy & Local',
            notes: 'Try the morning specialty buns or pour-over roasts.',
          },
          {
            title: `Botanical Gardens or Waterfront Park`,
            subtitle: `Stroll shaded pathways, fountain courtyards, and scenic greenery.`,
            category: 'nature' as const,
            locationName: `Riverside Greenery & Gardens, ${baseName}`,
            indoorOutdoor: 'outdoor' as const,
            vibe: 'Serene & Fresh',
            notes: 'Refreshing morning air and picturesque paths.',
          },
          {
            title: `Chef-Driven Bistro & Terrace Lunch`,
            subtitle: `Savor seasonal ingredients and local wine or beverage pairings.`,
            category: 'food' as const,
            locationName: `Historic Canal District, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Relaxed & Flavorful',
            notes: 'Reserve a window seat overlooking the square.',
          },
          {
            title: `Heritage Craft Studio & Design Boutiques`,
            subtitle: `Browse local ceramicists, textile artisans, and independent designers.`,
            category: 'shopping' as const,
            locationName: `Craft Quarter, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Creative & Curated',
            notes: 'Unique handmade souvenirs and gifts.',
          },
          {
            title: `Sunset Viewpoint & Twilight Lounge`,
            subtitle: `Watch the sunset cast golden hues across the rooftops with evening appetizers.`,
            category: 'nightlife' as const,
            locationName: `Panoramic Terraces, ${baseName}`,
            indoorOutdoor: 'indoor' as const,
            vibe: 'Scenic & Chilled',
            notes: 'Spectacular sunset panorama.',
          },
        ],
      ];

      const currentTmpls = templatesByDay[dayIdx % templatesByDay.length];

      const items = Array.from({ length: numStops }).map((_, i) => {
        const itemStartMins = startMins + i * (slotDuration + 15);
        const itemEndMins = Math.min(itemStartMins + slotDuration, endMins);
        const tmpl = currentTmpls[i % currentTmpls.length];
        const angle = ((i * 1.35 + dayIdx * 2.1) % (2 * Math.PI));
        const dist = 0.005 + ((i + 1) * 0.0035);
        return {
          id: `item-d${dayIdx + 1}-${Date.now()}-${i + 1}`,
          dayNumber: dayIdx + 1,
          dayDate: dateInfo.isoDate,
          time: formatMinutesToTime(itemStartMins),
          endTime: formatMinutesToTime(itemEndMins),
          title: tmpl.title,
          subtitle: tmpl.subtitle,
          category: tmpl.category,
          durationMins: itemEndMins - itemStartMins,
          locationName: tmpl.locationName,
          lat: finalLat + Math.sin(angle) * dist,
          lng: finalLng + Math.cos(angle) * dist * 1.25,
          indoorOutdoor: tmpl.indoorOutdoor,
          vibe: tmpl.vibe,
          notes: tmpl.notes,
          status: 'upcoming' as const,
        };
      });

      return {
        dayNumber: dayIdx + 1,
        date: dateInfo.isoDate,
        formattedDate: dateInfo.formattedDate,
        title: dayThemes[dayIdx % dayThemes.length],
        theme: dayThemes[dayIdx % dayThemes.length],
        items,
      };
    };

    const buildFallbackMultiDayPlan = () => {
      const days = [];
      const allItems = [];
      for (let d = 0; d < daysCount; d++) {
        const dayPlan = buildFallbackDay(d);
        days.push(dayPlan);
        allItems.push(...dayPlan.items);
      }
      return { days, items: allItems };
    };

    if (!ai) {
      // Dynamic fallback for any destination
      const fallbackData = buildFallbackMultiDayPlan();
      return res.json({
        cityName: baseName,
        country: destination.includes(',') ? destination.split(',').slice(1).join(',').trim() : 'Global',
        tagline: `Authentic ${daysCount}-day journey across ${baseName}`,
        lat: finalLat,
        lng: finalLng,
        startTime: formatMinutesToTime(startMins),
        endTime: formatMinutesToTime(endMins),
        numDays: daysCount,
        startDate,
        weather: liveWeather,
        days: fallbackData.days,
        items: fallbackData.items,
      });
    }

    const promptText = `
You are the MatterMap Master Travel Engine.
Create a highly authentic, realistic, beautifully paced ${daysCount}-day itinerary for the traveler's chosen destination: "${destination}".
Overall Trip Theme or Focus: ${theme || 'Balanced Explorer & Local Hidden Gems'}.
Total Trip Duration: ${daysCount} days starting from ${startDate}.
Coordinates: (Lat: ${finalLat}, Lng: ${finalLng}).
Live Weather: ${liveWeather ? `${liveWeather.tempC}°C, ${liveWeather.condition}, ${liveWeather.isRaining ? 'Raining' : 'Dry'}` : 'Mild'}.
Output Language: ${isVi ? 'VIETNAMESE (Tiếng Việt). Generate tagline, day titles, stop titles (or recognizable venue names with Vietnamese context), subtitles, logistical notes, and vibes in natural, engaging, professional Vietnamese.' : 'English'}.

Time Window Requirements for each day:
- Defined Start Time: ${formatMinutesToTime(startMins)}
- Defined End Time: ${formatMinutesToTime(endMins)}
- Total Daily Duration: ${totalTimeSpanMins} minutes.

Strict Output Requirements:
1. Generate exactly ${daysCount} distinct days.
2. For each day, provide 3 to 5 sequential stops fitting strictly within the range from ${formatMinutesToTime(startMins)} to ${formatMinutesToTime(endMins)}.
3. Stop 1 on each day MUST start at ${formatMinutesToTime(startMins)}, and the final stop MUST conclude around ${formatMinutesToTime(endMins)}.
4. Use REAL, SPECIFIC, AUTHENTIC venues, parks, food spots, coffee houses, viewpoints, or cultural places in "${destination}". Never repeat the same stops across different days.
5. Provide realistic durations with sequential start & end times (in 24-hour format HH:MM).
6. Correctly tag indoor vs. outdoor for each venue.
7. Set status for all stops to 'upcoming'.
${isVi ? '8. All user-facing strings (tagline, day titles, subtitles, notes, vibes) MUST be in natural Vietnamese.' : ''}
`;

    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cityName: { type: Type.STRING, description: 'Primary city or region name' },
            country: { type: Type.STRING, description: 'Country or province' },
            lat: { type: Type.NUMBER, description: 'Accurate Latitude' },
            lng: { type: Type.NUMBER, description: 'Accurate Longitude' },
            tagline: { type: Type.STRING, description: 'One vivid evocative sentence capturing this trip vibe' },
            days: {
              type: Type.ARRAY,
              description: 'Array of day plans',
              items: {
                type: Type.OBJECT,
                properties: {
                  dayNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING, description: 'Evocative theme for this specific day' },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        time: { type: Type.STRING, description: 'Start time e.g. 10:00' },
                        endTime: { type: Type.STRING, description: 'End time e.g. 11:30' },
                        title: { type: Type.STRING, description: 'Authentic specific venue/activity name' },
                        subtitle: { type: Type.STRING, description: 'One vivid sentence about what to do here' },
                        category: {
                          type: Type.STRING,
                          enum: ['sightseeing', 'food', 'coffee', 'walk', 'museum', 'shopping', 'relaxation', 'nature', 'nightlife'],
                        },
                        durationMins: { type: Type.INTEGER },
                        locationName: { type: Type.STRING, description: 'Neighborhood, street or landmark' },
                        lat: { type: Type.NUMBER, description: 'Precise latitude coordinate of this venue' },
                        lng: { type: Type.NUMBER, description: 'Precise longitude coordinate of this venue' },
                        indoorOutdoor: { type: Type.STRING, enum: ['indoor', 'outdoor'] },
                        vibe: { type: Type.STRING, description: 'Vibe descriptor e.g. Zen & Historic' },
                        notes: { type: Type.STRING, description: 'Travel tip or logistical advice' },
                        status: { type: Type.STRING, enum: ['completed', 'active', 'upcoming'] },
                      },
                      required: ['id', 'time', 'title', 'subtitle', 'category', 'durationMins', 'locationName', 'indoorOutdoor', 'vibe'],
                    },
                  },
                },
                required: ['dayNumber', 'items'],
              },
            },
          },
          required: ['cityName'],
        },
      },
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch (pe) {
      console.warn('Malformed JSON from Gemini itinerary:', pe);
    }

    const fallbackData = buildFallbackMultiDayPlan();
    const defaultCenterLat = parsed.lat || finalLat;
    const defaultCenterLng = parsed.lng || finalLng;

    let structuredDays: any[] = [];
    if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
      structuredDays = parsed.days.map((d: any, dIdx: number) => {
        const dateInfo = getFormattedDateOffset(startDate, dIdx);
        const dayItems = (d.items || []).map((item: any, iIdx: number) => {
          const angle = ((iIdx * 1.35 + dIdx * 2.1) % (2 * Math.PI));
          const dist = 0.005 + ((iIdx + 1) * 0.0035);
          const hasValidCoords = typeof item.lat === 'number' && !isNaN(item.lat) && typeof item.lng === 'number' && !isNaN(item.lng) && item.lat !== 0 && item.lng !== 0;
          return {
            ...item,
            id: item.id || `item-d${dIdx + 1}-${iIdx + 1}-${Date.now()}`,
            dayNumber: d.dayNumber || dIdx + 1,
            dayDate: dateInfo.isoDate,
            lat: hasValidCoords ? item.lat : defaultCenterLat + Math.sin(angle) * dist,
            lng: hasValidCoords ? item.lng : defaultCenterLng + Math.cos(angle) * dist * 1.25,
            status: item.status || 'upcoming',
          };
        });
        return {
          dayNumber: d.dayNumber || dIdx + 1,
          date: dateInfo.isoDate,
          formattedDate: dateInfo.formattedDate,
          title: d.title || dayThemes[dIdx % dayThemes.length],
          theme: d.title || dayThemes[dIdx % dayThemes.length],
          items: dayItems,
        };
      });
    } else if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
      // If AI returned a single flat items array instead of days
      const dateInfo = getFormattedDateOffset(startDate, 0);
      const dayItems = parsed.items.map((item: any, iIdx: number) => {
        const angle = ((iIdx * 1.35) % (2 * Math.PI));
        const dist = 0.005 + ((iIdx + 1) * 0.0035);
        const hasValidCoords = typeof item.lat === 'number' && !isNaN(item.lat) && typeof item.lng === 'number' && !isNaN(item.lng) && item.lat !== 0 && item.lng !== 0;
        return {
          ...item,
          id: item.id || `item-d1-${iIdx + 1}-${Date.now()}`,
          dayNumber: 1,
          dayDate: dateInfo.isoDate,
          lat: hasValidCoords ? item.lat : defaultCenterLat + Math.sin(angle) * dist,
          lng: hasValidCoords ? item.lng : defaultCenterLng + Math.cos(angle) * dist * 1.25,
          status: item.status || 'upcoming',
        };
      });
      structuredDays = [
        {
          dayNumber: 1,
          date: dateInfo.isoDate,
          formattedDate: dateInfo.formattedDate,
          title: dayThemes[0],
          theme: dayThemes[0],
          items: dayItems,
        },
      ];
    } else {
      structuredDays = fallbackData.days;
    }

    // Combine all stops into flat list
    let allStops: any[] = [];
    structuredDays.forEach((d) => {
      if (d.items && Array.isArray(d.items)) {
        allStops.push(...d.items);
      }
    });

    // Validate, correct, and enrich stops with Overpass API (OpenStreetMap)
    const targetDestLat = parsed.lat || finalLat;
    const targetDestLng = parsed.lng || finalLng;
    const targetCityName = parsed.cityName || baseName;

    try {
      allStops = await enrichItineraryWithOverpass(allStops, targetDestLat, targetDestLng, targetCityName);
      
      // Re-map enriched items back into structuredDays
      const enrichedMap = new Map<string, any>(allStops.map((it: any) => [it.id, it]));
      structuredDays = structuredDays.map((d: any) => ({
        ...d,
        items: (d.items || []).map((it: any) => enrichedMap.get(it.id) || it),
      }));
    } catch (overpassErr: any) {
      console.warn('Overpass enrichment caught error (continuing with base data):', overpassErr.message);
    }

    const responsePayload = {
      cityName: parsed.cityName || baseName,
      country: parsed.country || (destination.includes(',') ? destination.split(',').slice(1).join(',').trim() : 'Global'),
      tagline: parsed.tagline || `Authentic ${daysCount}-day journey across ${baseName}`,
      lat: parsed.lat || finalLat,
      lng: parsed.lng || finalLng,
      startTime: formatMinutesToTime(startMins),
      endTime: formatMinutesToTime(endMins),
      numDays: daysCount,
      startDate,
      weather: liveWeather,
      days: structuredDays,
      items: allStops,
    };

    res.json(responsePayload);
  } catch (err: any) {
    console.error('Generate itinerary error:', err.message);
    res.status(502).json({
      error: 'Generation failed',
      message: "Couldn't reach the AI itinerary generator — check your connection and try again.",
      details: err.message,
    });
  }
});

// Setup Vite middleware for development or serve static dist in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MatterMap server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
