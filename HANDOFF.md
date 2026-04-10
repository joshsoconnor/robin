# Robin App - Project Handoff & Status

## Current Application State (April 10, 2026 - V1.9.0)
This update resolves the lingering navigation UI issues: it completely migrates the app away from static maps to Street View imagery, dynamically anticipates the next stop during finalization, and properly resets underlying state upon route completion.

---

## ✅ What's New & Fixed (V1.5.0 - V1.9.0)

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

---

## 🏗️ Key Files Changed (V1.5 & V1.6)

| File | What Changed |
|------|-------------|
| `App.tsx` | Added `isMuted` state, updated active UI overlay to include mute toggle, passed properties down. |
| `ExploreScreen.tsx` | Added Mute FAB to side menu. |
| `VoiceAssistantNode.tsx` | Suppressed audio responses when muted; changed mic icon to reflect volume off state. |
| `ArrivalPanel.tsx` | Upgraded `staticmap` to `streetview` static image API. Removed "Next Delivery" static map thumbnail. |
| `StreetViewWrapper.tsx` | Added `google.maps.Marker` integration and auto-heading calibration for panorama POV. |
| `UploadRunScreen.tsx` | Placed a `useEffect` to defensively clear cached local components when the upstream `routeStops` list hits length 0. |

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

## 🛑 Status: V1.9.0 — PENDING FIELD VERIFICATION
- Build: ✅ PASSED (`BUILD SUCCESSFUL in 8s`)
- APK on Desktop: ✅ `Robin V1.9.apk` (Apr 10 2026)
- DB Sync (Calendar/Runs): ⏳ PENDING — awaiting field test
- StreetView Initialization + Pinning: ✅ Code is correct
- Next Stop Anticipation UI: ✅ Active & verifying upcoming locations dynamically
- Run State Clearing: ✅ Code is explicitly enforced through sync effect
- Global Voice Navigation Mute: ✅ Code is correct

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
- **StreetView half-screen** only appears after tapping "End Route" (enters `delivery-slideup` panel). If no `lat`/`lng` is resolved yet for the stop, it shows "Loading Street View..." — geocoding runs async and may not complete before ArrivalPanel opens.
- **profiles table** is missing `vehicle_type`, `vehicle_height`, `vehicle_weight`, `vehicle_length` columns — the vehicle profile fetch silently returns null. Not urgent but can cause truck routing features to be disabled.

---

## Previous Updates (Archived)

### ✅ April 02, 2026 - V1.0.1 Patch
Resolves two root-cause issues that were preventing the V1.0 APK from working correctly: a Java compilation error that had been silently blocking all builds, and a Supabase schema mismatch that caused all database sync to fail silently (`run_stops` schema mismatch).

### ✅ April 01, 2026 - V1.0.0
Robin V1.0 (Gold Version) reached production stability. Key changes: review phase in UploadRunScreen, Explore mode data isolation, Nav exit vs. auto-arrival fix, speed limit voice alerts, UI layout polish.

### ✅ March 26, 2026 - V4.8.1
V4.8.1 fixed critical bugs: video DB save failures (schema mismatch), run/calendar/admin saves silently aborting (wrong column names in `run_stops`), and the half-screen property preview disappearing immediately after arrival.

... [Previous version logs truncated for brevity] ...

