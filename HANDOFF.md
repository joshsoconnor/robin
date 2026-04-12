# Robin App - Project Handoff & Status

## Current Application State (April 12, 2026 - V2.1.0)
This update introduces the Navigation Action Menu and Truck-Aware Hazard Alerts. It significantly improves safety and pin accuracy by allowing real-time hazard reporting and coordinate correction directly from the guidance screen.

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

## 🛑 Status: V2.1.0 — PRODUCTION STABLE
- Build: ✅ PASSED
- APK on Desktop: ✅ `Robin V2.1.apk` (Apr 12 2026)
- Action Menu (+): ✅ Align and functional
- Truck Hazard Alerts: ✅ Voice and Visual alerts verified
- Pin Correction: ✅ Database update logic verified
- Run/Calendar Sync: ✅ TS build errors cleared
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
- **StreetView half-screen** only appears after tapping "End Route" (enters `delivery-slideup` panel).
- **profiles table** sync verified — height/weight columns now interact correctly with hazard engine.

---

## Previous Updates (Archived)

### ✅ April 10, 2026 - V1.9.0
Resolves navigation UI issues by migrating to Street View imagery, dynamic next-stop anticipation, and forced run state clearing.

### ✅ April 02, 2026 - V1.0.1 Patch
Resolves two root-cause issues that were preventing the V1.0 APK from working correctly: a Java compilation error that had been silently blocking all builds, and a Supabase schema mismatch that caused all database sync to fail silently (`run_stops` schema mismatch).

### ✅ April 01, 2026 - V1.0.0
Robin V1.0 (Gold Version) reached production stability. Key changes: review phase in UploadRunScreen, Explore mode data isolation, Nav exit vs. auto-arrival fix, speed limit voice alerts, UI layout polish.

### ✅ March 26, 2026 - V4.8.1
V4.8.1 fixed critical bugs: video DB save failures (schema mismatch), run/calendar/admin saves silently aborting (wrong column names in `run_stops`), and the half-screen property preview disappearing immediately after arrival.

... [Previous version logs truncated for brevity] ...

