# Robin App - Project Handoff & Status

## Current Application State (March 11, 2026)
Robin is a mobile-first Capacitor/React application for delivery logistics — route running, calendar management, and in-app Google Maps voice navigation.

---

## ✅ What's Working Now (End of March 11 Session - V2.1)

### 🔄 Run State Persistence (NEW - V2.1)
- **Cloud Resume:** Logged-in users can now close the app mid-run and pick up exactly where they left off. On app launch, Robin fetches the user's active `run_stops` from Supabase and restores the route with correct pending/completed statuses.
- **Smart Sync:** Only restores from cloud when no active local run exists, preventing accidental overwrites.

### 🏎️ Speedometer & Nav Header UI (FIXED - V2.1)
- **Speedometer Always Visible:** The speedometer now renders immediately at `0 km/h` when navigation starts, even when stationary. Repositioned higher to avoid overlap with the native ETA bar.
- **Redesigned Nav Header:** The floating green navigation header now includes the red "Exit" button directly inline, replacing the old bottom-right exit pill. Improved safe-area padding ensures no overlap with the phone status bar.

### 📸 Interactive Street View Integration (NEW)
- **Explore Modal:** Tapping the static Street View thumbnail opens a fully immersive, 360-degree interactive viewer.
- **Picture-in-Picture (PIP):** During live navigation, a clickable Street View thumbnail floats in the top corner for quick reference.
- **Arrival Split-Screen:** Upon arriving at a destination ("Mark Delivery Complete" flow), the top half of the screen dynamically shifts to a full interactive Street View panorama of the house/site, while the delivery action panel sits natively in the bottom half.

### 🎙️ Voice Assistant Refinements (FIXED)
- **Exact ETA Synchronization:** Robin's spoken ETA ("You should get there by 3:04pm") now perfectly matches the real-time Google Maps Navigation SDK ETA instead of calculating from rounded strings.
- **Microphone Reliability:** Disabled the disruptive native Android SpeechRecognition popup, preventing audio focus loss and ensuring Robin consistently "hears" the driver's inputs across complex UI layouts.

### 🚀 Improved Run Execution (NEW)
- **Mark Complete/Incomplete**: Drivers can now mark stops as complete OR incomplete directly from the Run Preview. The "Start Run" count updates instantly.
- **Dynamic Route Updates**: The map navigation now automatically skips any stops marked as "Completed" in the preview. Only "Pending" stops are included in the active polyline.
- **Contextual Markers**: Completed stops remain on the map as gray markers for reference, while pending stops are red.

### 🍱 OCR & UI Refinements (NEW)
- **OCR Accuracy**: Refined Gemini extraction logic to prevent "U 5" being read as "U S". Added strict rules for unit number parsing.
- **Preview UI Polishing**: Fixed transparency and overlap issues in the 3-dot management menu.
- **Persistence**: Finalized run sync with Supabase ensures the Map correctly reflects the driver's preview adjustments.

### 🎙️ Stop Spotter AI (NEW)
- **Proactive Voice Alerts**: App now monitors real-time GPS location relative to the current run.
- **On-the-way Detection**: If a driver passes within **200m** of a future pending stop, Robin triggers a voice announcement: *"Hey Josh, Stop #5 is coming up on your right in about 200 meters. Do you want to hit it now?"*
- **Safety First**: Intelligent logic prevents repetitive alerts for the same stop.

### 🗺️ Strategic Run Visualization (NEW)
- **Global Map Markers**: The **Explore** tab now displays numbered orange markers (1, 2, 3...) for every stop in the active run.
- **Visual Progress**: Completed stops are automatically switched to gray markers, giving the driver a clear visual of their remaining workload.
- **Auto-Geocoding**: App automatically resolves lat/lng for any address missing coordinates so they always appear on the map.

### 📋 Admin Run Overview (NEW)
- **Active Run Card**: Located in **Settings > Runs**, a new prioritized card shows the live status (e.g., "Active Run · 12 drops remaining").
- **Expandable Details**: Tapping the card reveals the full manifest: addresses, pending/completed status, and manifest notes.

### 🍱 Contextual Intelligence Feed (Refined)
- **Strict Destination Focus**: When navigation is active, the Intel feed automatically locks to the current destination.
- **Multi-Media Support**: Now fetches **Notes, Photos, and Videos** specifically for that address.
- **Clear Signals**: Site-specific intel is highlighted with a pulse animation and a "DESTINATION" badge.
- **Empty State Logic**: If no data exists for an address, it displays a helpful "No specific intel yet" message rather than showing unrelated global history.

### 🚚 Truck Routing & Hazard Avoidance
- **Vehicle Profiles**: Dimension-aware routing based on height, weight, and length.
- **IntelligentDetours**: Injects detours to avoid bridges/weight limits based on the vehicle profile.

### 🏁 Delivery Completion (FIXED)
- **Contextual Visibility**: "Mark Delivery Complete" button now only appears during active navigation.
- **Robust Logic**: Successfully marks stops as completed in Supabase and the UI, resets navigation state, and hides the native map.

### 🗺️ Navigation SDK & Tilt Fix (NEW)
- **SDK Stability**: Downgraded to Navigation SDK version `5.2.1` to resolve persistent build failures and ensure reliable class resolution.
- **Automated 3D Perspective**: Fixed the "tilt" issue by explicitly calling `followMyLocation(TILTED)` using fully qualified names in the native layer.
- **Enhanced Map UX**: Re-enabled high zoom (21f), 3D buildings, and manual tilt gestures within the navigation view.

---

## 🏗️ Key Files Changed (V2.1 Session)

| File | What Changed |
|------|-------------|
| `src/App.tsx` | Added **run state persistence** (fetches `run_stops` from Supabase on login/launch), moved **Exit** button into nav header, initialized speedometer to `0` on nav start. |
| `src/App.css` | Redesigned **nav header** (inline Exit button), repositioned **speedometer** higher to avoid native ETA overlap, increased safe-area top padding. |

---

## 🧱 Architecture: How Navigation Works

```
User taps "Start"
  → JS: NavigationSDK.initialize()
  → JS: NavigationSDK.startGuidance({ lat, lng, destination })
  → JS: onNavStart(label) → App.tsx sets navActive=true
       → React UI hides / Native nav visible through transparent WebView

Stop Spotter Logic (Background)
  → Geolocation.watchPosition monitors distance to pending Stop[]
  → If distance < 200m: Trigger NavigationSDK.speakText()
```

---

## ⚠️ Critical Things NOT to Do

### Build & APK
- **Always rename the APK appropriately (e.g., "Robin_v2.0.apk")** when copying to the user's Desktop.
- **Do NOT delete the "Active Run" card** from Settings; it is the primary way the user monitors the full manifest.
- **Avoid hard-coded address strings** in Intel; always use the `activeAddress` prop for matching.

---

## 🔧 Build Commands (Quick Reference)

**NOTE: Follow these steps precisely if `assembleDebug` fails or APK issues occur:**

```powershell
# 1. Sync the latest web assets into the Android native layer
npx cap sync android

# 2. Build the Android debug APK. We use .\gradlew assembleDebug.
# If it fails, check imports in NavigationPlugin.java and app build.gradle.
cd android
.\gradlew assembleDebug

# 3. Copy the resulting APK to the Desktop. 
# NOTE: The build output folder is intentionally mapped to C:\tmp\robin-build to avoid OneDrive locking issues.
Copy-Item "C:\tmp\robin-build\app\outputs\apk\debug\app-debug.apk" "C:\Users\joshs\OneDrive\Desktop\v2.0.apk" -Force
```
---

## 🛑 Immediate Blockers
- None at this time. APK successfully deployed to desktop.

---

## 🔮 Future Roadmap (Planned Enhancements)
- Continued optimization of the Voice Assistant's conversational context.
- Expand Interactive Street View markers with precise building entrance locations from Intel feed.
