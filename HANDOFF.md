# Robin App - Project Handoff & Status

## Current Application State (April 28, 2026 - V3.6.0)
This update fixes a critical navigation lifecycle bug where ending a run failed to tear down the native map overlay, resulting in a persistent white screen on app restart. It also ensures Explore mode properly clears destination pins when finishing a route.

---

## ✅ What's New & Fixed (V3.0.0 - V3.6.0)

### 🗺️ Navigation Lifecycle & UI Recovery (V3.6.0)
- **Issue**: Tapping "End Run" or "End Route" cleared the React UI state but failed to call `handleNavExit()` to shut down the Native Navigation SDK. This caused a permanent white screen over an empty map when the app was closed and reopened, as the `nav-active` flag remained stuck.
- **Fix**: Added explicit `handleNavExit()` teardown calls to `handleEndRun` and `handleEndRoute` to properly destroy the navigation session and clear `localStorage`.
- **Issue**: Explore Mode runs were not clearing the destination pin when finishing, preventing the map from cleanly resetting to the user's current location.
- **Fix**: Injected `setPersistedDestination(null)` into the `handleClearRun()` pipeline so the Explore map always returns to a fresh state.

### 🚀 OCR Model Recovery & UI Harden (V3.3.0)
- **Issue**: `gemini-2.0-flash-lite` was deprecated for new integrations, causing a 404 API error during photo uploads.
- **Fix**: Migrated `UploadRunScreen.tsx` to use the generally available `gemini-2.0-flash` model.
- **Issue**: Arrival Panel buttons ("End Route", "Exit Nav") were unclickable because the native navigation's `pointer-events: none` on the app container was inherited without override.
- **Fix**: Added explicit `pointer-events: auto` to all `ArrivalPanel.css` overlays, restoring interaction during active navigation.
- **Issue**: A "white screen" lock occurred if the app was closed during the processing phase, as it would try to restore a stale `processing` state on reload without an active request.
- **Fix**: Implemented a state-machine reset that forces the app back to the `capture` phase if it detects an interrupted `processing` state on startup.


### 🛡️ API Circuit Breaker & Rate Limiting (V3.0.0)
- **Issue**: A "death loop" or unthrottled rapid tapping event caused Robin to execute ~300,000 uncontrolled Gemini API requests, creating a massive billing spike.
- **Fix**: Created a unified `circuitBreaker.ts` architecture handling:
  - **Hard Rate Throttling:** Global Gemini triggers cannot fire more frequently than once every 60 seconds OR 500 meters of geographical movement (using native geolocation tracking).
  - **Concurrency Drops:** Built a `requestInProgress` mutex to permanently drop parallel execution requests.
  - **Exponential Backoff:** If the AI throws a rate-limit (429) or server drop (500), it enters an exponentially decaying retry queue (2s -> 4s -> 8s -> 16s) to aggressively blunt runaway scripts.

### 🧠 Model Optimization & Cost Scaling (V3.0.0)
- **Issue**: Standard tasks were relying exclusively on `gemini-2.0-flash` or outdated equivalents without acknowledging per-usage expense ratio.
- **Fix**: Downgraded simple background processes (e.g. `UploadRunScreen.tsx` OCR) and the voice assistant endpoint (`robin-chat` edge function) to use `gemini-2.0-flash-lite`. This slashes token pricing drastically while dedicating the heavy-weight `flash` model solely to complex visual recognition tasks like Sign Analyzer.

### 🔇 Global Navigation Mute
- **Issue**: Wanted the ability to silence turn-by-turn guidance, hazard warnings, and voice assistant responses without muting the entire OS volume.
- **Fix**: Added a persistent `isMuted` state to `App.tsx` (saved in `localStorage`). Built a mute/unmute toggle in the Settings screen, added a FAB to the Map/Explore screens, and integrated a mute button into the right-side active navigation overlay. Voice assistant and navigation SDK speech functions now check this state before speaking.

### 🏠 Arrival Panel Destination Preview
- **Issue**: The Arrival Panel used a static top-down map instead of a physical preview, and the interactive street view lacked context markers, sometimes facing the wrong way. Additionally, the "Next Stop" thumbnail at the bottom of the screen was redundant and cluttered the UI.
- **Fix**: 
  - Changed the Arrival Panel's primary static map API call to a static Street View API call.
  - In `StreetViewWrapper.tsx`, initialized a `google.maps.Marker` object injected directly into the 360 panorama to physically drop a red pin on the exact destination coordinates.
  - Utilized `google.maps.geometry.spherical.computeHeading` to calculate the exact heading to orient the interactive panorama towards the delivery point automatically.
  - Removed the `arrival-next-preview` thumbnail from the layout (V1.7.0).

### 🔮 Next Stop Anticipation UI
- **Issue**: Drivers wanted to visualize the upcoming stop *while* finalizing the current drop-off in the slide-up Arrival Panel.
- **Fix**: Re-wired the background logic of the `ArrivalPanel` header. The instant the user hits "End Route" and the panel slides up, the background image seamlessly swaps from the current house to the *next* house (dynamically labeled `NEXT STOP PINPOINT`). Tapping the background correctly opens the 360-degree panorama mapped specifically to that upcoming location (V1.9.0).

### 🧹 Run Screen State Clearing
- **Issue**: After clicking "End Run" and navigating back to the run sheet, the list of runs inexplicably remained with some deliveries showing as incomplete, despite backend clearance.
- **Fix**: Implemented a forced synchronization `useEffect` inside `UploadRunScreen.tsx` that strictly listens to upstream `routeStops` clearance. When the app-level routes array hits a length of `0`, the component forcibly overwrites its internally cached `localstorage` states and resets itself to the empty `capture` phase (V1.7.0).

### ➕ Navigation Action Menu & Hazards (V2.1.0)
- **Issue**: Drivers needed a way to report road hazards (low bridges, closures) and fix incorrect pins while navigation was active, without exiting the guidance screen.
- **Fix**: 
  - Added a **Plus Action Button** directly above the arrival button. 
  - **Report Hazard**: Integrated a slide-up menu to report `low_bridge`, `road_closure`, and `weight_limit` hazards.
  - **Update Pin**: Added a "Correction" feature that allows drivers to save their exact parked location as the new front-door coordinates for the current stop.
  - **Proximity Alerts**: Created a background hazard engine that monitors distance to bridges. If a bridge's clearance is lower than the truck's profile (3.3m), Robin triggers a visual banner and a voice warning when within 300 meters.

---

## 🏗️ Key Files Changed (V1.5 & V1.6)

| File | What Changed |
|------|-------------|
| `App.tsx` | Added `hazards` state and proximity alert engine. Implemented Plus button action menu. |
| `NavigationModals.tsx` | [NEW] Created shared component for AddCairn and AddHazard modals. |
| `ExploreScreen.tsx` | Refactored to use shared modals; cleaned up duplicate type definitions. |
| `CalendarScreen.tsx` | Fixed `_completedAt` property mismatch causing build failures. |
| `SettingsScreen.tsx` | Fixed null-check oversight in the delivery run enrichment logic. |

---

## 🔧 Build Commands

```powershell
# 1. Compile web assets
npm run build

# 2. Sync to Android
npx cap sync android

# 3. Build APK — auto-increments version and copies to Desktop
cd android
.\gradlew assembleDebug
```

> [!IMPORTANT]
> **Auto-Deploy & Auto-Version**: Every successful build:
> 1. **Scans your Desktop** for existing `Robin V*.apk` files
> 2. **Finds the highest version** (e.g. `Robin V1.3.apk`)
> 3. **Increments by 0.1** and saves the new file (e.g. `Robin V1.4.apk`)
> 4. Starts at **V1.2** if no prior builds are found on the Desktop
>
> You never need to rename or move APKs manually. The old versions remain on the Desktop as a history.

---

## 🛑 Status: V3.6.0 — PRODUCTION STABLE
- Build: ✅ PASSED
- APK on Desktop: ✅ `Robin V3.6.apk` (Apr 28 2026)
- Navigation Teardown: ✅ Fixed (handleNavExit called on end run/route)
- Explore Map Reset: ✅ Fixed (persisted destination cleared)
- OCR Recovery: ✅ Verified (gemini-2.0-flash)
- UI Responsiveness: ✅ Fixed (pointer-events: auto)
- White Screen Protection: ✅ Active
- API Circuit Breaker: ✅ Active (60s/500m limits enforced)
- Exponential Backoff: ✅ Functioning on 429/5xx responses
- Navigation Exit Visibility: ✅ Fixed
- Action Menu (+): ✅ Functional
- Truck Hazard Alerts: ✅ Voice and Visual alerts verified
- Pin Correction: ✅ Database update logic verified
- Run/Calendar Sync: ✅ Stable
- Global Voice Navigation Mute: ✅ Functional

---

## 🔍 Current Investigation (April 08, 2026) - Run Sync Failures
A silent failure was reported where runs are not saving to the database or showing in the Calendar/Admin views.

- **Status**: Investigation in progress.
- **Detailed Findings**: See [SYNC_FAILURE_INVESTIGATION.md](file:///c:/Users/joshs/OneDrive/Desktop/Apps/Robin/SYNC_FAILURE_INVESTIGATION.md)
- **Top Suspects**: 
    1. Missing unique constraint on `deliveries` table (breaks upsert).
    2. `fetchRunState` querying non-existent `run_stops.user_id` column.
    3. Potential RLS policy restrictions for Admin view.

---

## Known Remaining Issues (To Investigate After Field Test)
- **StreetView half-screen** only appears after tapping "End Route" (enters `delivery-slideup` panel).
- **profiles table** sync verified — height/weight columns now interact correctly with hazard engine.

---

## Previous Updates (Archived)

### ✅ April 20, 2026 - V2.5.0
- **Navigation Exit Visibility Fix**: Resolved issue where the 'End Run' button was unclickable behind the navigation footer.
- **Z-Index Optimization**: Increased `ArrivalPanel` z-index to 9000+.
- **UI Auto-Cleanup**: Navigation footer and right-side action stack are now automatically hidden when the Arrival Panel is active to prevent clutter and overlap.

### ✅ April 12, 2026 - V2.1.0
Introduced the Navigation Action Menu and Truck-Aware Hazard Alerts.

### ✅ April 02, 2026 - V1.0.1 Patch
Resolves two root-cause issues that were preventing the V1.0 APK from working correctly: a Java compilation error that had been silently blocking all builds, and a Supabase schema mismatch that caused all database sync to fail silently (`run_stops` schema mismatch).

### ✅ April 01, 2026 - V1.0.0
Robin V1.0 (Gold Version) reached production stability. Key changes: review phase in UploadRunScreen, Explore mode data isolation, Nav exit vs. auto-arrival fix, speed limit voice alerts, UI layout polish.

### ✅ March 26, 2026 - V4.8.1
V4.8.1 fixed critical bugs: video DB save failures (schema mismatch), run/calendar/admin saves silently aborting (wrong column names in `run_stops`), and the half-screen property preview disappearing immediately after arrival.

... [Previous version logs truncated for brevity] ...

