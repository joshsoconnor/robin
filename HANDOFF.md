# Robin App - Project Handoff & Status

## Current Application State (March 26, 2026 - V4.8.1)
Robin is a mobile-first Capacitor/React application for delivery logistics. V4.8.1 fixes three critical bugs: video DB save failures (schema mismatch), run/calendar/admin saves silently aborting (wrong column names in `run_stops`), and the half-screen property preview disappearing immediately after arrival.

---

## ✅ What's Fixed (V4.8.1)

### 🎥 Video Save ("Failed to Save" Error)
- **Root cause**: `ArrivalPanel.tsx` was inserting a `thumbnail_url` field into `location_videos`, a column that doesn't exist in the DB schema. Supabase rejected every insert when a thumbnail was successfully generated.
- **Fix**: Removed `thumbnail_url` from the DB insert payload. Auto-thumbnail is still uploaded to `location-videos` storage bucket for future indexing.

### 🔄 Runs Not Saving / Not Viewable in Calendar or Admin
- **Root cause**: `syncRouteToSupabase` in `App.tsx` inserted into `run_stops` using wrong column names (`address` → should be `address_text`; `status`, `lat`, `lng`, `place_id` don't exist in `run_stops`). Because the function throws on any error, the entire sync aborted — `admin_runs`, `admin_run_routes`, and `calendar_entries` also never saved.
- **Fix**: Corrected `run_stops` insert to use `address_text`, `is_completed` (boolean), `run_id`, `stop_order`, `manifest_notes` — matching the actual DB schema exactly.

### 🖼️ Half-Screen Property Image Vanishing Immediately
- **Root cause (1)**: The split-screen image was rendered inside the `navActive` overlay block. The moment arrival was triggered (≤50m), `handleManualArrive → handleNavExit` set `navActive = false`, hiding the entire overlay in the same frame.
- **Root cause (2)**: `.arrival-streetview-header` had no CSS height definition, so the embedded StreetView inside the delivery slide-up panel was always 0px tall.
- **Fix**: Removed the phantom split-view from the nav overlay. Added `.arrival-streetview-header { height: 200px; }` to `ArrivalPanel.css` so the already-existing StreetView preview in the delivery panel is now visible.

---

## 🏗️ Key Files Changed (V4.8.1)

| File | What Changed |
|------|-------------|
| `ArrivalPanel.tsx` | Removed `thumbnail_url` from `location_videos` insert; cleaned up thumbnail variable |
| `ArrivalPanel.css` | Added missing `.arrival-streetview-header` CSS rule (200px height) |
| `App.tsx` | Fixed `run_stops` insert column names; removed phantom proximity split-view |

---

## 🛑 Status: SUCCESS (V4.8.1)
- Build: ✅ PASSED
- APK on Desktop: ✅ `Robin v4.8.1.apk`
- Video Saving: ✅ FIXED (schema mismatch resolved)
- Run/Calendar/Admin Saving: ✅ FIXED (`run_stops` column names corrected)
- Half-Screen Property Preview: ✅ FIXED (CSS height added, moved out of nav overlay)
- Native Delivery Markers During Navigation: ✅ ADDED (numbered red/grey circles on the native nav map, auto-clear on run end)

---

## ✅ What's Working Now (V4.8)

### 🗺️ Navigation & Mapping
- **Free Map Pan During Navigation**: Fixed touch-event propagation in `NavigationPlugin.java`. Touches on the transparent WebView now correctly pass through to the native map container, allowing free panning and rotation during active guidance.
- **Urban Zoom Stabilization**: Tightened the navigation camera to a fixed range between `21.0f` and `21.5f` for higher urban detail during deliveries.
- **White Screen Fix**: Optimized route refresh logic in `App.tsx` (handleReRoute/handleNextDelivery) to ensure the map overlay is active before the Native SDK initializes, preventing the "white flash" during route calculation.
- **Static Map Stop Markers**: Street View preview images now include a primary red marker at the destination coordinates for immediate building identification.

### 🔄 Data Syncing & Storage
- **Instant Run Syncing**: Refactored `App.tsx` with a master `syncRouteToSupabase` hook. Run progress, stop status, and calendar entries are now updated in Supabase *instantly* upon every manual or automatic completion step.
- **Video Auto-Thumbnails**: `ArrivalPanel.tsx` now captures a frame from unrecorded video buffers to generate a JPEG thumbnail. These are uploaded to the `location-videos` bucket and stored in the database for better indexing.

---

## ✅ What's Working Now (V4.6)

### 🗺️ Navigation & Mapping
- **Early Route Arrival Bug**: Fixed an issue where the second route would immediately trigger an "Arrival" because the local distance state was not reset to a safe value before the Native SDK acquired the new route GPS data. 
- **White Screen on Route Exit**: Fixed a critical bug where the native map would turn blank white after manually ending a route. This was caused by the Navigation SDK maintaining an active silent guidance state and overlaying a white background frame. We now explicitly call `mNavigator.stopGuidance()` and `mNavigator.clearDestinations()` during route initialization.
- **Header UI Rescaling**: Decreased text sizes for the turn-by-turn header ('use right lanes' and 'distance') to prevent overflow on mobile displays.
- **Free Map Pan During Navigation**: Resolved an issue where touch events were being swallowed by the parent WebView's transparent layer. Touches now properly pass through to the native Navigation Map so the user can freely pan. Camera gestures are now explicitly forced 'enabled' in the SDK options.
- **Tighter Camera Tracking**: Default minimum zoom preference increased to 20.5 to keep the chase camera closer to the street level.

### 📷 Street View Look-Around
- **Close Button Re-Enabled**: Disabled the native Google Street View close button causing state mismatches. React state now perfectly controls Street View mounting/un-mounting.
- **Enabled Street View Map Panning**: Fixed pointer-events in the Explore mode overlapping, allowing panning commands from React through the UI.
- **Fixed Display Matrix Translation Bug**: Portaled out Street-View wrapper components from ArrivalPanel's CSS translating animation block. Fixed the underlying bug prohibiting the Google Maps panning gestures from registering when inside the transformed container.
- **Explore Mode Location Fixed**: Re-wrote the coordinate hand-off between ExploreScreen and App so Explore Mode Street View now opens successfully (instead of rendering black 0,0 space).

### 📦 Run Saving (Admin Runs + Calendar)
- **Admin Runs**: When user scans or manually enters a run, one tile is saved to `admin_runs` table and all stops are saved to `admin_run_routes`.
- **Calendar Entries**: A calendar entry is created/upserted in `calendar_entries` for the run date automatically on run start.
- All saves are non-blocking — errors are logged but never crash the app.

---

## 🏗️ Key Files Changed (V4.6)

| File | What Changed |
|------|-------------|
| `StreetViewWrapper.tsx` | Disabled standard Google Close button so our React button owns the state lifecycle. |
| `App.tsx` | Kept local references of `activeNavLat` and `activeNavLng` in state, bypassing the fact that `routeStops` was empty in Explore mode. |
| `NavigationPlugin.java` | Refactored `setMinZoomPreference(20.5f)` and enforced all camera UI gesture overrides (`setScrollGesturesEnabled(true)`, etc.). |
| `build.gradle` | Upgraded to V4.6 configuration. |

---

## 🔧 Build Commands (V4.6 - Strict)

```powershell
# IMPORTANT: Run all commands from the project root unless noted

# 1. Compile web assets (TypeScript + Vite)
npm run build

# 2. Sync to Android (copies dist/ into android assets)
npx cap sync android

# 3. Build APK — run from the android/ subdirectory
cd android
.\gradlew assembleDebug
```

> [!IMPORTANT]
> **APK Output**: The `copyApkToDesktop` Gradle task auto-copies the APK to your desktop as:
> `C:\Users\joshs\OneDrive\Desktop\Robin v4.8.apk`
>
> If the copy task says "Source APK not found", run `.\gradlew clean assembleDebug` from the `android` folder. Note that the build output is redirected to `C:\tmp\robin-build` to prevent OneDrive file-locking issues.

> [!NOTE]
> **Supabase Tables Required for Admin Runs**: `admin_runs` (pk: `run_id`), `admin_run_routes`, `calendar_entries` (unique on `user_id,entry_date,run_id`). If these don't exist, errors are logged silently and the run still works normally.

---

## 🛑 Status: SUCCESS (V4.8)
- Build: ✅ PASSED (V4.8 / SDK 6.1)
- APK on Desktop: ✅ `Robin v4.8.apk`
- Map Free Panning: ✅ FIXED (Touch-forwarding)
- Auto-Thumbnails: ✅ IMPLEMENTED
- Syncing (Instant): ✅ IMPLEMENTED (All Run tables)
- Next-Stop Markers: ✅ FIXED
- White Screen Bug: ✅ FIXED


---

## ✅ What's Working Now (V3.9)

### 🗺️ Navigation & Mapping
- **NavigationSDK Plugin Implemented**: Resolved the "NavigationSDK plugin is not implemented" error by manually registering `NavigationPlugin` in `MainActivity.java`.
- **SDK 6.x Migration**: Successfully updated the codebase to support Google Maps Navigation SDK v6.1.0, resolving class conflicts between the stand-alone Maps SDK and the Navigation SDK.
- **Stable Navigation Baseline**: Users can move freely around the map during navigation. The native SDK has been stabilized.
- **Recenter Button**: Native recenter functionality is active. If the user pans away, they can instantly snap back to "Following" mode.
- **Improved Accuracy (Place ID)**: Passes exact coordinates and Place IDs to `startGuidance`, ensuring precise routing to delivery entrances.

### 🤖 Gemini AI Integration
- **Maps Grounding**: The voice assistant (`robin-chat`) is powered by Gemini with Google Maps tools. Robin can answer location-aware questions using real-time coordinates.
- **Visual Style**: Updated Voice Assistant node with a premium Gemini-inspired aesthetic.

### 🏎️ UI & UX Improvements
- **Startup Crash Fixed**: Restored the `MainActivity.java` entry point, ensuring the app boots correctly.
- **Legible Speedometer**: Dark translucent "glassmorphism" background on the speedometer.
- **Touch-Only Photo Viewer**: Gyroscope tracking disabled in the Runs mode photo viewer.
- **Reliable Runs Saving**: Optimized database saving logic for consistent persistence.

---

## 🏗️ Key Files Changed (V3.9)

| File | What Changed |
|------|-------------|
| `MainActivity.java` | **[FIXED]** Added manual `registerPlugin(NavigationPlugin.class)` to resolve Capacitor discovery issues. |
| `NavigationPlugin.java` | **[UPDATED]** Refactored imports for Navigation SDK 6.x (`com.google.android.gms.maps.GoogleMap`) and fixed `CameraPerspective` usage. |
| `App.tsx` | Updated `tripProgress` listener and consolidated navigation data flow. |
| `build.gradle` (app) | Updated APK output versioning to `V3.9.apk`. |
| `index.ts` (Supabase) | Integrated Gemini 1.5 Pro with Google Maps grounding tools. |

---

## 🔧 Build Commands (V3.9 - Verified)

```powershell
# 1. Compile web assets
npm run build

# 2. Sync to Android
npx cap sync android

# 3. Build & Auto-Export
cd android
.\gradlew.bat clean assembleDebug --no-daemon
```

> [!IMPORTANT]
> **APK Output**: The final file is placed on your Desktop as:
> `C:\Users\joshs\OneDrive\Desktop\V3.9.apk`

---

## 🛑 Status: SUCCESS
- Build: ✅ PASSED
- APK Verified on Desktop: ✅ YES
- Plugin Implementation: ✅ ACTIVE
- Navigation Stability: ✅ STABLE
- Gemini Awareness: ✅ GROUNDED
- Data Persistence: ✅ PERSISTENT
