# Robin App - Project Handoff & Status

## Current Application State (March 10, 2026)
Robin is a mobile-first Capacitor/React application for delivery logistics — route running, calendar management, and in-app Google Maps voice navigation.

---

## ✅ What's Working Now (End of March 10 Morning Session - V1.2)

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

## 🏗️ Key Files Changed This Session

| File | What Changed |
|------|-------------|
| `src/App.tsx` | Implemented **Stop Spotter** logic, global geocoding, and passed `routeStops` to sub-screens. |
| `src/components/ExploreScreen.tsx` | Added **Global Run Markers** (orange/gray indicators) to the map. |
| `src/components/SettingsScreen.tsx` | Added the **Expandable Active Run Card** to the Runs section. |
| `src/components/IntelligenceFeed.tsx` | Refined strict contextual filtering, added **Video support**, and "DESTINATION" badging. |
| `src/components/IntelligenceFeed.css` | Added pulse animations and contextual badge styling. |
| `src/components/ArrivalPanel.tsx` | Added **Note deletion** and persistence for the "Next Delivery" status. |
| `src/components/MapScreen.tsx` | Fixed "Mark Delivery Complete" visibility and terminal navigation logic. |
| `src/App.tsx` | Fixed `handleCompletePendingStop` to correctly reset navigation state. |
| `fix_deletion_policies.sql` | Consolidated RLS policies for robust multi-category deletion. |
| `android/app/build.gradle` | Updated Navigation SDK to `5.2.1` for build stability. |
| `NavigationPlugin.java` | Fixed map tilt implementation and class visibility. |

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
- **Always rename the APK to "Robin Live V1.2.apk"** when delivering to the user.
- **Do NOT delete the "Active Run" card** from Settings; it is the primary way the user monitors the full manifest.
- **Avoid hard-coded address strings** in Intel; always use the `activeAddress` prop for matching.

---

## 🔧 Build Commands (Quick Reference)

```powershell
# Full rebuild cycle (Note: build output is directed to C:\tmp\robin-build to avoid OneDrive sync lag)
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug

# Copy APK from tmp build folder to Desktop with requested release name
Copy-Item "C:\tmp\robin-build\app\outputs\apk\debug\app-debug.apk" "C:\Users\joshs\OneDrive\Desktop\Robin Live V1.2.apk" -Force
```
