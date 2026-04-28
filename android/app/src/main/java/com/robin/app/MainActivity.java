package com.robin.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            Log.e(TAG, "Attempting to register NavigationPlugin...");
            registerPlugin(NavigationPlugin.class);
            Log.e(TAG, "NavigationPlugin registered successfully!");
        } catch (Throwable t) {
            Log.e(TAG, "FAILED to register NavigationPlugin!", t);
        }

        super.onCreate(savedInstanceState);
    }
}
