package com.robin.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import androidx.annotation.NonNull;

import androidx.core.app.ActivityCompat;
import androidx.appcompat.app.AppCompatActivity;

import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.libraries.navigation.*;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.model.BitmapDescriptorFactory;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

@CapacitorPlugin(name = "NavigationSDK")
public class NavigationPlugin extends Plugin implements LocationListener {

    private static final String TAG = "NavigationPlugin";
    private SupportNavigationFragment navFragment;
    private Navigator mNavigator;
    private FrameLayout mapContainer;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    // Track if custom distance arrival listener is registered
    private Navigator.RemainingTimeOrDistanceChangedListener distanceListener;
    private boolean hasTriggeredArrivalForCurrentRoute = false;
    private boolean navServiceRegistered = false;

    // When followMyLocation() is called the SDK fires REASON_GESTURE internally.
    // Suppress that first event so the Recenter button does not appear automatically.
    private volatile boolean ignoreNextCameraMove = false;

    private LocationManager locationManager;

    // Delivery stop markers overlaid on the native nav map
    private final java.util.List<Marker> deliveryMarkers = new java.util.ArrayList<>();

    @PluginMethod
    public void initialize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                // Make WebView transparent so native nav map shows behind it
                bridge.getWebView().setBackgroundColor(Color.TRANSPARENT);

                if (mapContainer == null) {
                    ViewGroup vg = (ViewGroup) bridge.getWebView().getParent();
                    mapContainer = new FrameLayout(getContext());
                    mapContainer.setId(View.generateViewId());
                    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT);
                    vg.addView(mapContainer, 0, lp);

                    // Show immediately so the map renders before guidance starts
                    mapContainer.setVisibility(View.VISIBLE);

                    // Push map content down to clear status bar and system icons
                    ViewCompat.setOnApplyWindowInsetsListener(mapContainer, (v, windowInsets) -> {
                        int top = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
                        int bottom = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;

                        // Add 48dp extra padding to lift the ETA bar up from the bottom edge
                        int extraBottomPadding = (int) (48 * getContext().getResources().getDisplayMetrics().density);
                        v.setPadding(0, top, 0, bottom + extraBottomPadding);
                        return WindowInsetsCompat.CONSUMED;
                    });

                    // the ETA bar
                    mapContainer.setBackgroundColor(Color.parseColor("#1c1c1c"));

                    // Touch forwarding hack: pass touches through transparent WebView to the Map
                    bridge.getWebView().setOnTouchListener(new View.OnTouchListener() {
                        @Override
                        public boolean onTouch(View v, android.view.MotionEvent event) {
                            if (mapContainer != null && mapContainer.getVisibility() == View.VISIBLE) {
                                android.view.MotionEvent copy = android.view.MotionEvent.obtain(event);
                                mapContainer.dispatchTouchEvent(copy);
                                copy.recycle();
                            }
                            return false; // let WebView process it so React buttons work
                        }
                    });
                }

                if (navFragment == null) {
                    navFragment = new SupportNavigationFragment();
                    FragmentManager fragmentManager = ((AppCompatActivity) getActivity()).getSupportFragmentManager();
                    fragmentManager.beginTransaction()
                            .replace(mapContainer.getId(), navFragment)
                            .commitNow();
                    // Re-show if previously hidden
                    mapContainer.setVisibility(View.VISIBLE);
                }

                // Already have a working navigator — resolve immediately
                if (mNavigator != null) {
                    if (mapContainer != null) {
                        mapContainer.setVisibility(View.VISIBLE);
                    }
                    call.resolve();
                    return;
                }

                // The Navigation SDK REQUIRES Terms of Service to be accepted.
                // Error code 4 (TERMS_NOT_ACCEPTED) is returned if we skip this step.
                // areTermsAccepted / showTermsAndConditionsDialog take an Application (not
                // Activity)
                if (!NavigationApi.areTermsAccepted(getActivity().getApplication())) {
                    NavigationApi.showTermsAndConditionsDialog(
                            getActivity(),
                            "Robin", // Company / app name shown in the dialog
                            new NavigationApi.OnTermsResponseListener() {
                                @Override
                                public void onTermsResponse(boolean areTermsAccepted) {
                                    if (areTermsAccepted) {
                                        requestNavigator(call);
                                    } else {
                                        call.reject("Navigation unavailable: Terms of Service were not accepted.");
                                    }
                                }
                            });
                } else {
                    requestNavigator(call);
                }

            } catch (Exception e) {
                Log.e(TAG, "Failed in initialize()", e);
                call.reject("Failed to initialize navigation: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void recenter(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (navFragment != null) {
                navFragment.getMapAsync(googleMap -> {
                    // Suppress the SDK's internal camera-move that fires after followMyLocation
                    ignoreNextCameraMove = true;
                    googleMap.followMyLocation(GoogleMap.CameraPerspective.TILTED);

                    JSObject ret = new JSObject();
                    ret.put("isDrifted", false);
                    notifyListeners("mapDrifted", ret);
                });
            }
            if (call != null) call.resolve();
        });
    }

    private void requestNavigator(PluginCall call) {
        requestNavigatorWithRetry(call, 0);
    }

    /**
     * Requests a Navigator, retrying up to 3 times with a 1.5s delay when error 4
     * occurs
     * but terms ARE accepted. This handles the SDK propagation delay after the
     * terms dialog.
     */
    private void requestNavigatorWithRetry(PluginCall call, int attempt) {
        NavigationApi.getNavigator(getActivity(), new NavigationApi.NavigatorListener() {
            @Override
            public void onNavigatorReady(Navigator navigator) {
                mNavigator = navigator;
                mNavigator.setTaskRemovedBehavior(Navigator.TaskRemovedBehavior.QUIT_SERVICE);
                call.resolve();
            }

            @Override
            public void onError(@NavigationApi.ErrorCode int errorCode) {
                Log.e(TAG, "getNavigator error code: " + errorCode + " (attempt " + attempt + ")");
                // Error 4 = TERMS_NOT_ACCEPTED. When terms ARE accepted but SDK hasn't
                // propagated the acceptance yet, retry with a delay (up to 5 times).
                if (errorCode == 4
                        && attempt < 5
                        && NavigationApi.areTermsAccepted(getActivity().getApplication())) {
                    Log.i(TAG, "Terms accepted but SDK returned 4 — retrying in 2.0s");
                    new android.os.Handler(android.os.Looper.getMainLooper())
                            .postDelayed(() -> requestNavigatorWithRetry(call, attempt + 1), 2000);
                } else {
                    call.reject("Navigation API error code: " + errorCode
                            + ". Check the Navigation SDK is enabled for this API key and Google Play Services is available.");
                }
            }
        });
    }

    @PluginMethod
    public void startGuidance(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            // Keep screen awake during active navigation
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            if (mapContainer != null) {
                mapContainer.setVisibility(View.VISIBLE);
            }
            if (mNavigator == null) {
                call.reject("Navigator not initialized. Call initialize() first.");
                return;
            }

            try {
                String address = call.getString("destination");
                Double lat = call.getDouble("lat");
                Double lng = call.getDouble("lng");
                String modeStr = call.getString("travelMode", "DRIVING");

                if (lat == null || lng == null) {
                    call.reject("Must provide lat and lng of destination.");
                    return;
                }

                Waypoint destination = Waypoint.builder()
                        .setLatLng(lat, lng)
                        .setTitle(address != null ? address : "Destination")
                        .build();

                hasTriggeredArrivalForCurrentRoute = false; // Reset for new route

                if (mNavigator != null) {
                    mNavigator.stopGuidance();
                    mNavigator.clearDestinations();
                }

                mNavigator.setAudioGuidance(Navigator.AudioGuidance.VOICE_ALERTS_AND_GUIDANCE);

                // Start Speedometer/Location tracking for React UI
                startLocationUpdates();

                // Suppress all native UI overlays to use custom React UI
                if (navFragment != null) {
                    navFragment.setHeaderEnabled(false);
                    navFragment.setEtaCardEnabled(false);
                    navFragment.setTripProgressBarEnabled(false);
                    navFragment.setSpeedLimitIconEnabled(true); // Show native icon as fallback
                }

                attemptStartGuidance(call, destination, modeStr, 0);
            } catch (Exception e) {
                call.reject("Exception setting destination: " + e.getMessage());
            }
        });
    }

    private void attemptStartGuidance(PluginCall call, Waypoint destination, String modeStr, int attempt) {
        com.google.android.libraries.navigation.ListenableResultFuture<com.google.android.libraries.navigation.Navigator.RouteStatus> future;

        if ("WALKING".equalsIgnoreCase(modeStr) || "CYCLING".equalsIgnoreCase(modeStr)
                || "TWO_WHEELER".equalsIgnoreCase(modeStr)) {
            int travelMode = RoutingOptions.TravelMode.WALKING;
            if ("CYCLING".equalsIgnoreCase(modeStr))
                travelMode = RoutingOptions.TravelMode.CYCLING;
            if ("TWO_WHEELER".equalsIgnoreCase(modeStr))
                travelMode = RoutingOptions.TravelMode.TWO_WHEELER;

            RoutingOptions routingOptions = new RoutingOptions();
            routingOptions.travelMode(travelMode);
            future = mNavigator.setDestination(destination, routingOptions);
        } else {
            // Default to DRIVING without RoutingOptions to prevent Native SDK crashes
            future = mNavigator.setDestination(destination);
        }

        future.setOnResultListener(
                new com.google.android.libraries.navigation.ListenableResultFuture.OnResultListener<com.google.android.libraries.navigation.Navigator.RouteStatus>() {
                    @Override
                    public void onResult(
                            com.google.android.libraries.navigation.Navigator.RouteStatus routeStatus) {
                        Log.i(TAG, "Route status: " + routeStatus + " (attempt " + attempt + ")");
                        if (routeStatus == com.google.android.libraries.navigation.Navigator.RouteStatus.OK) {
                            mNavigator.startGuidance();

                            // Ensure camera is in following mode with a tight zoom for urban navigation
                            if (navFragment != null) {
                                navFragment.getMapAsync(googleMap -> {
                                    // Suppress the camera-move event the SDK fires as part of its
                                    // own follow-animation so the Recenter button does not flash.
                                    ignoreNextCameraMove = true;

                                    // Ensure camera is in following mode with a tight zoom for urban navigation
                                    googleMap.followMyLocation(
                                            GoogleMap.CameraPerspective.TILTED);

                                    // Detect manual panning to show Recenter button in React
                                    googleMap.setOnCameraMoveStartedListener(reason -> {
                                        if (reason == GoogleMap.OnCameraMoveStartedListener.REASON_GESTURE) {
                                            if (ignoreNextCameraMove) {
                                                // This is the SDK's own follow-camera animation; ignore it.
                                                ignoreNextCameraMove = false;
                                                return;
                                            }
                                            JSObject ret = new JSObject();
                                            ret.put("isDrifted", true);
                                            notifyListeners("mapDrifted", ret);
                                        }
                                    });

                                    // Also detect when map returns to following mode
                                    googleMap.setOnMyLocationClickListener(location -> {
                                        ignoreNextCameraMove = true;
                                        googleMap.followMyLocation(GoogleMap.CameraPerspective.TILTED);
                                        JSObject ret = new JSObject();
                                        ret.put("isDrifted", false);
                                        notifyListeners("mapDrifted", ret);
                                    });

                                    // Set a tight zoom level to fix "too far away" on mobile
                                    googleMap.setMaxZoomPreference(20.0f);
                                    googleMap.setMinZoomPreference(18.0f);
                                    // Ensure 3D buildings are visible to help the tilt perspective
                                    googleMap.setBuildingsEnabled(true);
                                    // Enable ALL gesture inputs explicitly since we rely on them for custom controls
                                    googleMap.getUiSettings().setScrollGesturesEnabled(true);
                                    googleMap.getUiSettings().setScrollGesturesEnabledDuringRotateOrZoom(true);
                                    googleMap.getUiSettings().setZoomGesturesEnabled(true);
                                    googleMap.getUiSettings().setRotateGesturesEnabled(true);
                                    googleMap.getUiSettings().setTiltGesturesEnabled(true);
                                });
                            }

                            // Register for turn-by-turn updates via TurnByTurnManager service
                            try {
                                if (navServiceRegistered) {
                                    mNavigator.unregisterServiceForNavUpdates();
                                }
                                mNavigator.registerServiceForNavUpdates(
                                    getContext().getPackageName(),
                                    NavUpdateService.class.getName(),
                                    1 // preview 1 upcoming step
                                );
                                navServiceRegistered = true;
                            } catch (Exception e) {
                                Log.e(TAG, "Failed to register NavUpdateService: " + e.getMessage());
                            }

                            // Implement custom Arrival Listener at exactly 100 meters
                            if (distanceListener != null) {
                                mNavigator.removeRemainingTimeOrDistanceChangedListener(distanceListener);
                            }
                            distanceListener = new Navigator.RemainingTimeOrDistanceChangedListener() {
                                @Override
                                public void onRemainingTimeOrDistanceChanged() {
                                    if (hasTriggeredArrivalForCurrentRoute || mNavigator == null)
                                        return;
                                    try {
                                        com.google.android.libraries.navigation.TimeAndDistance td = mNavigator
                                                .getCurrentTimeAndDistance();
                                        if (td != null) {
                                            JSObject progress = new JSObject();
                                            progress.put("meters", td.getMeters());
                                            progress.put("seconds", td.getSeconds());

                                            // Read turn-by-turn data from NavUpdateService
                                            com.google.android.libraries.mapsplatform.turnbyturn.model.NavInfo navInfo = NavUpdateService.latestNavInfo;
                                            if (navInfo != null && navInfo.getCurrentStep() != null) {
                                                com.google.android.libraries.mapsplatform.turnbyturn.model.StepInfo step = navInfo.getCurrentStep();
                                                int maneuverVal = step.getManeuver();
                                                Log.d(TAG, "[TurnByTurn] maneuver=" + maneuverVal + " instruction=" + step.getFullInstructionText());
                                                progress.put("nextManeuver", maneuverVal);
                                                progress.put("nextInstruction", step.getFullInstructionText());
                                                progress.put("stepDistance", navInfo.getDistanceToCurrentStepMeters());
                                            }

                                            notifyListeners("tripProgress", progress);

                                            // Removed the proactive 50m arrival trigger here.
                                            // Web UI App.tsx already checks m <= 50 and handles manual arrival
                                            // without forcing incomplete destinations to resolve.
                                        }
                                    } catch (Exception e) {
                                        Log.e(TAG, "Error checking distance for arrival: " + e.getMessage());
                                    }
                                }
                            };
                            // Tick every 10 meters or 10 seconds checking for the 100m threshold
                            mNavigator.addRemainingTimeOrDistanceChangedListener(10, 10, distanceListener);

                            call.resolve();
                        } else if ((routeStatus == com.google.android.libraries.navigation.Navigator.RouteStatus.ROUTE_CANCELED
                                ||
                                routeStatus == com.google.android.libraries.navigation.Navigator.RouteStatus.NO_ROUTE_FOUND)
                                &&
                                attempt < 6) { // Retry more times (up to ~15s total)
                            Log.w(TAG, "Route " + routeStatus
                                    + " — retrying in 2.5s as map may still be acquiring location...");
                            new android.os.Handler(android.os.Looper.getMainLooper())
                                    .postDelayed(() -> attemptStartGuidance(call, destination, modeStr, attempt + 1),
                                            2500);
                        } else {
                            Log.e(TAG, "Failed to route: " + routeStatus);
                            // Hide blank native map container so user doesn't see empty map
                            if (mapContainer != null) {
                                mapContainer.setVisibility(View.GONE);
                            }
                            // Remove screen keep-awake since navigation didn't start
                            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                            // Make sure WebView is visible and non-transparent so user isn't stuck
                            bridge.getWebView().setVisibility(View.VISIBLE);
                            bridge.getWebView().setBackgroundColor(Color.WHITE);
                            // Reject the JS call so the UI knows navigation failed
                            call.reject("Route failed: " + routeStatus);
                        }
                    }
                });
    }

    private void requestAudioFocus() {
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        }

        AudioManager.OnAudioFocusChangeListener listener = focusChange -> {
            // No-op for now, just needed to satisfy the API requirements
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(listener)
                    .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(listener, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
    }

    private void abandonAudioFocus() {
        if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else if (audioManager != null) {
            audioManager.abandonAudioFocus(null);
        }
    }

    // ── Delivery Markers ─────────────────────────────────────────────────────

    /**
     * Draws numbered delivery markers on the active native nav map.
     * JS passes an array of { lat, lng, stopNumber, status } objects.
     * Call this right after startGuidance resolves.
     */
    @PluginMethod
    public void setDeliveryMarkers(PluginCall call) {
        com.getcapacitor.JSArray stops = call.getArray("stops");
        if (stops == null || navFragment == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            navFragment.getMapAsync(googleMap -> {
                // Clear any previous markers first
                for (Marker m : deliveryMarkers) m.remove();
                deliveryMarkers.clear();

                try {
                    for (int i = 0; i < stops.length(); i++) {
                        org.json.JSONObject stop = stops.getJSONObject(i);
                        double lat = stop.getDouble("lat");
                        double lng = stop.getDouble("lng");
                        int stopNumber = stop.getInt("stopNumber");
                        boolean isCompleted = stop.optBoolean("isCompleted", false);

                        Bitmap bmp = createNumberedMarkerBitmap(stopNumber, isCompleted);
                        MarkerOptions opts =
                            new MarkerOptions()
                                .position(new LatLng(lat, lng))
                                .icon(BitmapDescriptorFactory.fromBitmap(bmp))
                                .anchor(0.5f, 0.5f)
                                .zIndex(isCompleted ? 40 : 50 + stopNumber)
                                .title("Stop " + stopNumber);

                        Marker marker = googleMap.addMarker(opts);
                        if (marker != null) deliveryMarkers.add(marker);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error adding delivery markers: " + e.getMessage());
                }
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void clearDeliveryMarkers(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            for (Marker m : deliveryMarkers) m.remove();
            deliveryMarkers.clear();
            if (call != null) call.resolve();
        });
    }

    /**
     * Draws a circle with a number inside, matching the web map marker style.
     * Pending = coral/red (#E53935), Completed = grey (#9E9E9E).
     */
    private Bitmap createNumberedMarkerBitmap(int number, boolean isCompleted) {
        int sizePx = 80; // 80px = crisp on hdpi screens
        Bitmap bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        // Circle background
        Paint circlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        circlePaint.setColor(isCompleted ? Color.parseColor("#9E9E9E") : Color.parseColor("#E53935"));
        circlePaint.setStyle(Paint.Style.FILL);
        canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 2, circlePaint);

        // White border ring
        Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        borderPaint.setColor(Color.WHITE);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(5);
        canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 4, borderPaint);

        // Number label
        Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(number >= 10 ? 28 : 34);
        textPaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        textPaint.setTextAlign(Paint.Align.CENTER);
        // Center vertically
        float textY = sizePx / 2f - (textPaint.ascent() + textPaint.descent()) / 2f;
        canvas.drawText(String.valueOf(number), sizePx / 2f, textY, textPaint);

        return bmp;
    }

    @PluginMethod
    public void hideMap(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            // Remove screen keep-awake
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            // Mute voice guidance when user exits navigation.
            // Do NOT call stopGuidance() or clearDestinations() here — doing so
            // leaves the SDK in a persistent ROUTE_CANCELED state on the next run.
            // Those calls are deferred to the start of the next startGuidance() call.
            if (mNavigator != null) {
                mNavigator.setAudioGuidance(Navigator.AudioGuidance.SILENT);
                // Remove custom distance arrival listener to prevent stale callbacks on next
                // run
                if (distanceListener != null) {
                    mNavigator.removeRemainingTimeOrDistanceChangedListener(distanceListener);
                    distanceListener = null;
                }
                // Unregister turn-by-turn service
                if (navServiceRegistered) {
                    try {
                        mNavigator.unregisterServiceForNavUpdates();
                    } catch (Exception e) {
                        Log.e(TAG, "Error unregistering nav service: " + e.getMessage());
                    }
                    navServiceRegistered = false;
                }
                NavUpdateService.latestNavInfo = null;
            }
            abandonAudioFocus();

            // Clear delivery markers when navigation ends
            for (Marker m : deliveryMarkers) m.remove();
            deliveryMarkers.clear();

            // IMPORTANT: Do NOT null mNavigator or destroy navFragment here.
            // The Navigator singleton is tightly coupled to its SupportNavigationFragment.
            // Destroying the fragment causes ROUTE_CANCELED; nulling the navigator causes
            // "Navigator not initialized". Keep both alive — just hide and stop.

            // Hide the map container (don't destroy the fragment inside it)
            if (mapContainer != null) {
                mapContainer.setVisibility(View.GONE);
            }

            // Restore WebView background and visibility
            bridge.getWebView().setVisibility(View.VISIBLE);
            bridge.getWebView().setBackgroundColor(Color.WHITE);

            // Only notify JS if this was triggered natively (via FAB button).
            if (call == null) {
                // Manual cancellation of guidance never automatically considers as arrived.
                notifyListeners("navExited", new JSObject());
            }

            if (call != null) {
                call.resolve();
            }

            stopLocationUpdates();
        });
    }

    private void startLocationUpdates() {
        if (locationManager == null) {
            locationManager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        }
        try {
            if (ActivityCompat.checkSelfPermission(getContext(),
                    Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 1, this);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error starting location updates: " + e.getMessage());
        }
    }

    private void stopLocationUpdates() {
        if (locationManager != null) {
            locationManager.removeUpdates(this);
        }
    }

    @Override
    public void onLocationChanged(@NonNull Location location) {
        float speedKmh = 0f;
        if (location.hasSpeed()) {
            float speedMps = location.getSpeed();
            // Convert m/s to km/h
            speedKmh = speedMps * 3.6f;
        }

        JSObject ret = new JSObject();
        ret.put("speedKmh", Math.round(speedKmh));

        notifyListeners("speedUpdate", ret);
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {
    }

    @Override
    public void onProviderEnabled(@NonNull String provider) {
    }

    @Override
    public void onProviderDisabled(@NonNull String provider) {
    }

    @PluginMethod
    public void showMap(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (mapContainer != null) {
                mapContainer.setVisibility(View.VISIBLE);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void speakText(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.isEmpty()) {
            call.reject("No text provided");
            return;
        }

        // Lazy-init TTS engine
        if (tts == null) {
            tts = new TextToSpeech(getContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    tts.setLanguage(java.util.Locale.getDefault());
                    ttsReady = true;
                    Log.d(TAG, "TTS engine initialized");
                    setupTTSListener();
                    // Speak the queued text now that TTS is ready
                    String utteranceId = "robin_speech_" + System.currentTimeMillis();
                    tts.speak(text, TextToSpeech.QUEUE_ADD, null, utteranceId);
                } else {
                    Log.e(TAG, "TTS init failed with status: " + status);
                }
            });
            call.resolve();
            return;
        }

        if (ttsReady) {
            String utteranceId = "robin_speech_" + System.currentTimeMillis();
            tts.speak(text, TextToSpeech.QUEUE_ADD, null, utteranceId);
        } else {
            Log.w(TAG, "TTS not ready yet, text will be skipped");
        }
        call.resolve();
    }

    private void setupTTSListener() {
        if (tts == null)
            return;
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                Log.d(TAG, "TTS Started: " + utteranceId);
            }

            @Override
            public void onDone(String utteranceId) {
                Log.d(TAG, "TTS Finished: " + utteranceId);
                JSObject ret = new JSObject();
                ret.put("utteranceId", utteranceId);
                notifyListeners("speakEnd", ret);
            }

            @Override
            public void onError(String utteranceId) {
                Log.e(TAG, "TTS Error: " + utteranceId);
            }
        });
    }
}
