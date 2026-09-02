# ![MatterMap](https://i.ibb.co/2x0yJYW/Matter-Map.jpg)
**A live, adaptive travel itinerary planner.** 
*Built for AI Riser Vietnam 2026: #BuildwithGoogleAI*

<p align="center">
  <a href="https://mattermap.ai.studio"><b>🌐 Try Live App</b></a> &nbsp;&bull;&nbsp;
  <a href="https://www.youtube.com/watch?v=YsB12I6RLWg"><b>🎥 Watch Demo (YouTube)</b></a> &nbsp;&bull;&nbsp;
  <a href="https://www.facebook.com/share/v/19PTK8dFhL/"><b>📱 Facebook Post</b></a>
</p>

> Most travel planners generate a schedule and stop there. MatterMap adapts as your trip actually unfolds.

## 🚩 The Problem
Travel plans are usually made once and never change — even when weather changes, you're running late, a queue is too long, or you're just tired. You are left to manually rebuild your schedule, often based on AI-guessed addresses and hours that aren't even accurate.

## 💡 The Solution
MatterMap reacts to reality. Instead of relying on AI guesses, it grounds your itinerary in verified map data and adjusts to your day in real time.

*   📍 **Real-World Accuracy:** Stops are cross-checked against OpenStreetMap (Overpass & Photon) to ensure coordinates and operating hours are actually correct.
*   📸 **Queue Detection:** Point your camera at a long line. Gemini Vision estimates the wait time and automatically suggests a better stop if it threatens your schedule.
*   ⏰ **"I'm Late" Button:** Tap once to instantly reshuffle your current stop's timing and find alternatives that fit your new window.
*   🌦️ **Context Aware:** The "Live Pulse" feature tracks your pace and checks real-time weather updates every 30 minutes to keep your plan viable.
*   🗣️ **Voice Control:** Tell the app what you want to change, and the itinerary updates immediately.
*   ✨ **The Essentials:** Multi-day planning, an interactive map view, saved accounts, and more!

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Reasoning, scheduling, & voice** | Gemini |
| **Wait-time image analysis** | Gemini Vision |
| **Auth & saved itineraries** | Firebase |
| **Map rendering** | MapLibre GL JS + OpenStreetMap tiles |
| **Destination search** | Photon |
| **Place & hours validation** | Overpass API |
| **Build & deployment** | Google AI Studio |

## 🚀 What's Next?
*   Integrating real-time crowd and busyness data.
*   Using machine learning on user behavior to improve personalized suggestions.
*   Building a verified local partner network.
*   Launching native iOS and Android apps.
*   Adding a freemium tier (free planning, premium live re-planning).
*   Smart checklist of what to bring, based on your itinerary and weather forecast

## 👥 The Team
Built by Ben, Bill, Tele, and Troy. 

First created at the AI Riser Vietnam Hands-On Workshop (1st Place, Lotus Hack), and developed further for AI Riser Vietnam 2026.
