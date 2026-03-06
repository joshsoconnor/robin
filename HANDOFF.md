# Robin App - Project Handoff & Status

## Current Application State (March 2026)
Robin is a mobile-first Capacitor/React application for delivery logistics — route running, calendar management, and in-app Google Maps voice navigation. The app is built with React/TypeScript (Vite), Capacitor, and a custom native Android Navigation SDK plugin.

---

## ✅ What's Working Now (End of March 6 Session)

### Truck Routing & Hazard Avoidance (Phase 7)
- **Vehicle Profiles**: Users can set height, weight, and length in `SettingsScreen.tsx`. Dimensions are fetched on login and used for routing.
- **Hazard Reporting**: Dedicated FAB in Explore and Map screens allows drivers to report bridge heights and weight limits. Data persists to Supabase `hazards`.
- **Intelligent Rerouting**: App checks for dimension conflicts before starting guidance. Triggers voice warning ("Warning! Low bridge ahead") and injects detour waypoints to force rerouting.

### UI Polishing & Layout Fixes (Phase 8-11)
- **Settings Page**: Fixed container clipping and row squashing. Standardized item padding (`18px`) and group margins (`28px`).
- **Runs Page**: Finalized "Start Run" button clearance with `60px` bottom padding.
- **Explore Page**: Reduced gap between search bar and filter pills (now `20px`). Corrected FAB padding to `20px` right. Renamed "Fuel" filter to "Servo".
- **Media Save Audit**: Successfully completed a full audit of the photo and video saving feature. Added `user_id` and `category` columns to Supabase tables. Corrected RLS policies and Supabase Storage bucket security.
- **Admin Power**: Added red trash icons for the admin (`joshua@rakaviti.com`) to delete media items from Explore and Arrival screens.
- **Custom Branding**: Replaced generic icons with premium SVGs for **"Loading Zone"** (based on user sign) and **"Public Toilets"** (using a specific requested SVG).
- **Servo Search**: Fixed the "Servo" button to correctly search Google Maps for `gas_station`.
- **Voice Context**: Fixed a bug where `routeStops` weren't passed to `ExploreScreen`. Robin now has full journey context during map exploration.

### Native Google Maps Voice Navigation
Both Explore and Run screens launch native in-app turn-by-turn voice navigation via `NavigationPlugin.java`. Includes custom voice announcements for stop address and ETA.

When Start is pressed:
1. The entire React UI disappears (`main-content` → `display: none`)
2. The native Google Maps navigation UI fills the screen (route, voice, camera follow)
3. Only `← Exit Navigation` pill + destination label remain as an overlay
4. Voice guidance starts automatically

When `← Exit Navigation` is pressed:
1. `mNavigator.setAudioGuidance(SILENT)` mutes the voice
2. The arrival listener is removed from the navigator
3. The `mapContainer` is hidden (`View.GONE`) — the `SupportNavigationFragment` and `mNavigator` are **kept alive**
4. React UI reappears exactly as left

### Explore Screen (`ExploreScreen.tsx`)
- Google Maps JS API shows route before navigation starts
- Addresses searched via Google Places Autocomplete (uncontrolled input — fast on mobile)
- Start button shows `"Starting..."` during SDK init (~3-5s)
- Terms of Service dialog shown on first use (Navigation SDK requires this — only shown once)
- After Terms accepted, SDK initialization is retried up to 3× with 1.5s delay (handles propagation delay)

### Run Screen (`MapScreen.tsx`)
- Loads stops from Supabase `run_stops` table
- Route drawn from current location → all stops using JS DirectionsService (orange polyline)
- **Numbered red circle markers** (1, 2, 3...) show each stop's position on the map
- Works with **single stop** (was previously 2+ only)
- Stops missing `lat`/`lng` are geocoded on-the-fly via `google.maps.Geocoder` before nav starts
- `navActive` prop hides the bottom sheet when navigation is running

### App-Level Nav State (`App.tsx`)
- `navActive` / `navLabel` state managed globally
- `handleNavStart(label)` called by ExploreScreen or MapScreen after SDK starts
- `handleNavExit()` stops guidance + hides map + clears state
- `sessionStorage('nav-active', 'nav-label')` persists nav state across background/foreground cycles
- Bottom nav bar hidden while navigating

### Other Features (From Earlier Sessions)
- **Video capture**: Uses `@capacitor/camera` (native), uploads to Supabase Storage
- **Fast geolocation**: Low-accuracy fix first (~1s), then upgrades to high-accuracy in background
- **Calendar screen**: Dark mode fixed (white gap resolved in `CalendarScreen.css`)
- **Safe area padding**: All screens pad correctly for notch / status bar / home indicator
- **BottomNavBar**: Correct safe area inset padding at bottom

---

## 🏗️ Key Files Changed This Session

| File | What Changed |
|------|-------------|
| `android/app/.../NavigationPlugin.java` | Terms dialog, retry logic, routeStatus logging, completely destroying `SupportNavigationFragment` on exit to fix restart bugs, increased timeout to 10s for slow location acquisition |
| `src/App.tsx` | Global `navActive` state, `handleNavStart`, `handleNavExit`, `main-content` hide on nav, session persistence |
| `src/App.css` | `.nav-overlay` styles (transparent overlay, exit pill, address label) |
| `src/components/ArrivalPanel.tsx` | **NEW** — Styled arrival panel with Re-Route / End Route / Delivery slide-up (Instructions, Media tabs, Next Delivery) |
| `src/components/ArrivalPanel.css` | **NEW** — Arrival panel styling matching app design system |
| `src/components/MapScreen.tsx` | Voice announcement now includes street number/name + computed ETA arrival time, passes full address to `onNavStart` |
| `src/components/ExploreScreen.tsx` | **Clear Destination** button on bottom sheet, **cairns layer** (POI markers), **Add POI FAB** with AddCairnModal, **Admin Delete** for media, **Custom SVGs** for markers, fixed **Voice context** passing |
| `src/components/IntelligenceFeed.tsx` | Added **Admin Delete** buttons and integrated the new **Loading Zone** and **Toilet** SVG icons for visual consistency |
| `media_audit_fixes.sql` | **NEW** — Hardens `location_photos`, `location_videos`, and `location_notes` with `user_id` attribution and RLS security |
| `SettingsScreen.css`, `UploadRunScreen.css` | Top safe area padding |

---

## 🧱 Architecture: How Navigation Works

```
User taps "Start"
  → JS: NavigationSDK.initialize()
       → Java: areTermsAccepted()? If not: show terms dialog
       → Java: getNavigator() [retries 3× on error 4 if terms accepted]
       → mNavigator ready
  → JS: NavigationSDK.startGuidance({ lat, lng, destination })
       → Java: mNavigator.setDestination(waypoint)
       → Java: onResult → setAudioGuidance(VOICE) → startGuidance()
  → JS: onNavStart(label) → App.tsx sets navActive=true
       → main-content display:none (React UI hides)
       → nav-overlay renders (transparent, Exit button on top)
       → Native nav fragment visible through transparent WebView

User taps "← Exit Navigation"
  → Java: mNavigator.stopGuidance() + setAudioGuidance(SILENT)
  → Java: fragmentManager.beginTransaction().remove(navFragment) (Destroys fragment, avoids NO_ROUTE_FOUND later)
  → JS: navActive=false → main-content visible again
```

---

## ⚠️ Critical Things NOT to Do

### Java / NavigationPlugin.java
- **Do NOT null `mNavigator` in `hideMap()`**. The Navigator is a singleton managed by the SDK — nulling our Java reference means `getNavigator()` won't return a working instance on the next run, causing "Navigator not initialized" errors.
- **Do NOT destroy `navFragment` (SupportNavigationFragment) in `hideMap()`**. The Navigator singleton is tightly coupled to its fragment. Destroying the fragment causes `ROUTE_CANCELED` on the next `setDestination()` call.
- **Do NOT call `stopGuidance()` or `clearDestinations()` in `hideMap()`**. These leave the SDK in a persistent `ROUTE_CANCELED` state. Instead, defer those calls to the **start** of the next `startGuidance()` — clear old state right before setting the new destination.
- **Do NOT fire `notifyListeners("navExited")` when `hideMap()` is called from JS** (i.e. when `call != null`). Only fire it for native FAB-triggered exits (`call == null`). Otherwise it creates a feedback loop: JS → hideMap → navExited → JS → hideMap → navExited... that queues stale events which fire during the **next** navigation session.
- **Do NOT use `hasArrivalListener` boolean flag** to track arrival listeners. Store the actual `Navigator.ArrivalListener` reference and call `removeArrivalListener()` before adding a new one. Otherwise listeners stack on the singleton navigator across sessions.
- **Do NOT call `NavigationApi.areTermsAccepted()` with `getActivity()`** — it takes `Application`, use `getActivity().getApplication()`.

### React / TypeScript
- **Do NOT add `value=` prop to the Places Autocomplete input** in ExploreScreen. It MUST be an uncontrolled input (`ref` only, no `value=`). Adding a controlled value breaks Places Autocomplete on mobile with severe lag.
- **Do NOT use deep-links to Google Maps as a fallback.** This was removed intentionally — the user wants in-app navigation only.
- **Do NOT manage `native-nav-active` class or `sessionStorage('nav-active')` from inside ExploreScreen or MapScreen.** It's centralized in `App.tsx` via the `onNavStart` prop callback. Managing it in both places causes desync.
- **Do NOT accidentally re-add `background-color` to `.app-container` or `#root`** when navActive — this blocks the native nav fragment from showing through the transparent WebView.

### Build
- **Always run `npx cap sync android` before `gradlew assembleDebug`** after any web code change.
- **APK output is redirected to `C:/tmp/robin-build/`** (configured in `android/build.gradle`) to avoid OneDrive file locking. Don't change this.
- **Copy the APK to Desktop** with: `Copy-Item "C:\tmp\robin-build\app\outputs\apk\debug\app-debug.apk" "C:\Users\joshs\OneDrive\Desktop\app-debug.apk" -Force`

---

## 📋 Remaining Issues / Next Session Priorities

### Navigation (High Priority)
1. ~~**Navigation Restart Bug**~~ — **FIXED (March 5)**. Three interrelated root causes: (a) nulling `mNavigator` → "Navigator not initialized"; (b) destroying fragment → `ROUTE_CANCELED`; (c) `navExited` event feedback loop + stacked arrival listeners → flash-and-disappear. Fix: keep both alive, defer cleanup to next `startGuidance()`, store/remove arrival listeners properly, only fire `navExited` for native FAB exits.
2. **Explore error code 4 persisting** — User still occasionally sees this after Terms are accepted. The retry logic should help. If it persists, investigate whether the API key is fully provisioned for Navigation SDK.
3. **Camera follow / zoom-in** — When navigation starts, the native SDK should auto-follow the user's location in a zoomed-in tilted perspective.

### Runs / MapScreen (Medium Priority)  
4. **Route from UploadRunScreen → run_stops table** — Geocoded lat/lng is currently applied in-memory only during nav. Consider persisting to Supabase.
5. ~~**Stop completion flow**~~ — **PARTIALLY IMPLEMENTED (March 5)**. "Next Delivery" button in ArrivalPanel marks the current stop as `completed` and starts navigation to the next pending stop. Full persistence to Supabase `run_stops` table not yet wired up.

### Recently Fixed (March 5 — Latest Session)
6. ~~**Explore mode can't back out of destination**~~ — **FIXED**. Added a visible "Clear Destination" button at the bottom of the Explore bottom sheet. Also clears route info and resets the search bar.
7. ~~**No way to add POIs (toilets, parking, etc.)**~~ — **FIXED**. Added a Floating Action Button (FAB) in both Explore and Runs mode. Tapping opens a category picker modal (Public Toilet, Parking, Coffee/Food, Loading Zone, Eating Spot) that saves a new cairn to Supabase at the user's current GPS location.
8. ~~**Cairns not visible in Explore mode**~~ — **FIXED**. Explore map now fetches all cairns from Supabase and renders them as AdvancedMarker POI pins. Tapping a pin shows an info card with the category and note.
9. ~~**Videos not saving**~~ — **FIXED**. Root cause: the `location-videos` Supabase Storage bucket did not exist. User created the bucket. Code already handles upload correctly (detects MIME type, falls back to blob URL if bucket missing).
10. ~~**Arrival screen was generic alert**~~ — **FIXED**. Replaced `alert("You have arrived")` with styled `ArrivalPanel` component: Re-Route (refresh icon) + End Route buttons, delivery slide-up with Instructions/Media tabs and Next Delivery button.
11. ~~**Voice announcement missing street/time**~~ — **FIXED**. Voice now says "Starting route to [street #, street name]. You should arrive by [ETA time]." ETA computed from route duration.

### Previously Fixed (March 5 — Earlier Sessions)
9. ~~**Video recording opens camera for photo only**~~ — **FIXED**. Replaced `Camera.getPhoto()` with a hidden file input using `accept="video/*"` and `capture="environment"` which opens the native video recorder.
10. ~~**Dark mode delivery instructions invisible**~~ — **FIXED**. Replaced hard-coded `#666` and `#222` colors in `.note-card` CSS with `var(--text-secondary)` and `var(--text-main)`.
11. ~~**Calendar swipe changes month from anywhere on page**~~ — **FIXED**. Moved `onTouchStart`/`onTouchEnd` handlers from root `calendar-screen` div to only the `calendar-card` grid.
12. ~~**Calendar entry cards show full address + instructions**~~ — **FIXED**. Added `formatShortAddress()` to strip addresses to street, suburb, postcode (no state/country). Removed notes/videos display from entry cards.
13. ~~**Autocomplete dropdown wider than input field**~~ — **FIXED**. Added `width`, `left`, `right` constraints to `.pac-container` in `index.css`.
14. ~~**Address autocomplete broken after rescan**~~ — **FIXED**. Made the manual address input uncontrolled (no `value` prop) and added `phase` to the autocomplete `useEffect` dependency.
15. ~~**Run map stops indistinguishable**~~ — **FIXED**. Added numbered red circle markers (1, 2, 3...) using SVG icons at each stop's coordinates from the Directions API response.

---

## 🔐 Environment & Config

- **Supabase URL + keys**: In `src/lib/supabase.ts`
- **Google Maps API key**: In `android/app/src/main/AndroidManifest.xml` (`com.google.android.geo.API_KEY`) and `index.html` (JS Maps)
- **Navigation SDK**: Same API key — must have "Navigation SDK for Android" enabled in Google Cloud Console
- **Build output**: `C:/tmp/robin-build/`
- **Dev**: `npm run dev` (Vite, port 8100 typically)

---

## 🔧 Build Commands (Quick Reference)

```powershell
# Full rebuild cycle
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug

# Copy APK to Desktop and rename iteratively (e.g., v5.0, v5.1, etc.)
# Update the version number in the destination filename for each new build!
Copy-Item "C:\tmp\robin-build\app\outputs\apk\debug\app-debug.apk" "C:\Users\joshs\OneDrive\Desktop\app-debug-v5.0.apk" -Force

# Dev server only
npm run dev
```
