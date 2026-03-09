package com.robin.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
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

import com.google.android.material.floatingactionbutton.FloatingActionButton;
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

import com.google.android.libraries.navigation.NavigationApi;
import com.google.android.libraries.navigation.Navigator;
import com.google.android.libraries.navigation.NavigationApi;
import com.google.android.libraries.navigation.Navigator;
import com.google.android.libraries.navigation.SupportNavigationFragment;
import com.google.android.libraries.navigation.Waypoint;
import com.google.android.libraries.navigation.RoutingOptions;

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
    private FloatingActionButton exitBtn;

    // Track if custom distance arrival listener is registered
    private Navigator.RemainingTimeOrDistanceChangedListener distanceListener;
    private Navigator.SpeedLimitListener speedLimitListener;
    private boolean hasTriggeredArrivalForCurrentRoute = false;

    private LocationManager locationManager;

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

                    // Add a native exit button
                    exitBtn = new FloatingActionButton(getContext());
                    // Reddish color for exit
                    exitBtn.setBackgroundTintList(
                            android.content.res.ColorStateList.valueOf(Color.parseColor("#E53935")));
                    exitBtn.setRippleColor(Color.parseColor("#B71C1C"));
                    // We'll just use a text label or standard android close icon
                    exitBtn.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
                    exitBtn.setColorFilter(Color.WHITE);
                    exitBtn.setOnClickListener(v -> hideMap(null));

                    FrameLayout.LayoutParams btnLp = new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT);
                    btnLp.gravity = android.view.Gravity.BOTTOM | android.view.Gravity.END;
                    // safe area padding (e.g. above system nav bar)
                    int padding = (int) (32 * getContext().getResources().getDisplayMetrics().density);
                    btnLp.setMargins(0, 0, padding, padding);
                    mapContainer.addView(exitBtn, btnLp);

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

                    // Set background to white so the padded area at the bottom blends cleanly with
                    // the ETA bar
                    mapContainer.setBackgroundColor(Color.WHITE);
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
            if (mNavigator == null) {
                call.reject("Navigator not initialized. Call initialize() first.");
                return;
            }

            String address = call.getString("destination");
            Double lat = call.getDouble("lat");
            Double lng = call.getDouble("lng");
            String modeStr = call.getString("travelMode", "DRIVING");

            if (lat == null || lng == null) {
                call.reject("Must provide lat and lng of destination.");
                return;
            }

            try {
                // Keep screen on during navigation
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

                // FIX: If the native map was previously hidden by an exit, show it again
                if (mapContainer != null) {
                    mapContainer.setVisibility(View.VISIBLE);
                }

                if (exitBtn != null) {
                    exitBtn.setVisibility(View.VISIBLE);
                }

                // Hide React WebView so native map shows and receives touch events
                // Use INVISIBLE instead of GONE to avoid aggressive layout changes during route
                // init
                bridge.getWebView().setVisibility(View.INVISIBLE);

                // Request audio focus so Android doesn't suppress voice guidance
                requestAudioFocus();

                // Clear any previous route/destinations before setting the new one.
                // This MUST happen here (not in hideMap) because clearing on exit
                // leaves the SDK in a persistent ROUTE_CANCELED state.
                mNavigator.stopGuidance();
                mNavigator.clearDestinations();
                hasTriggeredArrivalForCurrentRoute = false;

                Waypoint destination = Waypoint.builder()
                        .setLatLng(lat, lng)
                        .setTitle(address != null ? address : "Destination")
                        .build();

                mNavigator.setAudioGuidance(Navigator.AudioGuidance.VOICE_ALERTS_AND_GUIDANCE);

                // Start Speedometer/Location tracking
                startLocationUpdates();

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
                                    // 2 corresponds to TILTED perspective
                                    googleMap.followMyLocation(2);
                                    // Set a default higher zoom level to fix "too far away" on mobile
                                    googleMap.setMaxZoomPreference(21f);
                                    // Animate to a tight zoom level initially
                                    googleMap
                                            .animateCamera(com.google.android.gms.maps.CameraUpdateFactory.zoomTo(19f));
                                });
                            }

                            // Speed Limit Listener
                            if (speedLimitListener != null) {
                                mNavigator.removeSpeedLimitListener(speedLimitListener);
                            }
                            speedLimitListener = new Navigator.SpeedLimitListener() {
                                @Override
                                public void onSpeedLimitChanged(Navigator.SpeedLimitChangeInfo speedLimit) {
                                    JSObject ret = new JSObject();
                                    ret.put("speedLimitKmh", Math.round(speedLimit.getSpeedLimitKmh()));
                                    notifyListeners("speedLimitUpdate", ret);
                                }
                            };
                            mNavigator.addSpeedLimitListener(speedLimitListener);

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
                                        if (td != null && td.getMeters() > 0 && td.getMeters() <= 50) {
                                            Log.i(TAG, "Custom 50m arrival triggered! Distance: " + td.getMeters());
                                            hasTriggeredArrivalForCurrentRoute = true;

                                            JSObject ret = new JSObject();
                                            ret.put("arrived", true);
                                            notifyListeners("navArrived", ret);
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
                            // Make sure WebView is visible so user isn't stuck on a blank screen
                            bridge.getWebView().setVisibility(View.VISIBLE);

                            if (exitBtn != null) {
                                exitBtn.setVisibility(View.GONE);
                            }

                            call.reject("Failed to route: " + routeStatus);
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
                if (speedLimitListener != null) {
                    mNavigator.removeSpeedLimitListener(speedLimitListener);
                    speedLimitListener = null;
                }
                // Remove custom distance arrival listener to prevent stale callbacks on next
                // run
                if (distanceListener != null) {
                    mNavigator.removeRemainingTimeOrDistanceChangedListener(distanceListener);
                    distanceListener = null;
                }
            }
            abandonAudioFocus();

            // IMPORTANT: Do NOT null mNavigator or destroy navFragment here.
            // The Navigator singleton is tightly coupled to its SupportNavigationFragment.
            // Destroying the fragment causes ROUTE_CANCELED; nulling the navigator causes
            // "Navigator not initialized". Keep both alive — just hide and stop.

            // Hide the map container (don't destroy the fragment inside it)
            if (mapContainer != null) {
                mapContainer.setVisibility(View.GONE);
            }

            if (exitBtn != null) {
                exitBtn.setVisibility(View.GONE);
            }

            // Restore WebView background and visibility
            bridge.getWebView().setVisibility(View.VISIBLE);
            bridge.getWebView().setBackgroundColor(Color.WHITE);

            // Only notify JS if this was triggered natively (via FAB button).
            if (call == null) {
                boolean isArrived = false;

                // If we have an active navigator and a destination, check remaining distance
                if (mNavigator != null) {
                    try {
                        com.google.android.libraries.navigation.TimeAndDistance timeAndDistance = mNavigator
                                .getCurrentTimeAndDistance();
                        if (timeAndDistance != null) {
                            int metersRemaining = timeAndDistance.getMeters();
                            Log.i(TAG, "User exited navigation. Distance remaining: " + metersRemaining + " meters");
                            // If within 200 meters, treat manual exit as an Arrival
                            if (metersRemaining > 0 && metersRemaining <= 200) {
                                isArrived = true;
                            }
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error getting time and distance on exit: " + e.getMessage());
                    }
                }

                if (isArrived) {
                    JSObject ret = new JSObject();
                    ret.put("arrived", true);
                    notifyListeners("navArrived", ret);
                } else {
                    notifyListeners("navExited", new JSObject());
                }
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
        if (location.hasSpeed()) {
            float speedMps = location.getSpeed();
            // Convert m/s to km/h
            float speedKmh = speedMps * 3.6f;

            JSObject ret = new JSObject();
            ret.put("speedKmh", Math.round(speedKmh));
            notifyListeners("speedUpdate", ret);
        }
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
