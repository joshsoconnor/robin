package com.robin.app;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.util.Log;

import com.google.android.libraries.mapsplatform.turnbyturn.TurnByTurnManager;
import com.google.android.libraries.mapsplatform.turnbyturn.model.NavInfo;

/**
 * Lightweight service that receives turn-by-turn navigation updates from
 * the Google Navigation SDK v6 via TurnByTurnManager.
 *
 * The latest NavInfo is stored in a static field so NavigationPlugin can
 * read it synchronously from the UI thread.
 */
public class NavUpdateService extends Service {

    private static final String TAG = "NavUpdateService";

    /** The most recent NavInfo – read by NavigationPlugin in its distance listener. */
    public static volatile NavInfo latestNavInfo;

    private Messenger messenger;
    private TurnByTurnManager turnByTurnManager;

    @Override
    public void onCreate() {
        super.onCreate();
        turnByTurnManager = TurnByTurnManager.createInstance();
        messenger = new Messenger(new Handler(Looper.getMainLooper()) {
            @Override
            public void handleMessage(Message msg) {
                if (msg.what == TurnByTurnManager.MSG_NAV_INFO) {
                    try {
                        NavInfo navInfo = turnByTurnManager.readNavInfoFromBundle(msg.getData());
                        if (navInfo != null) {
                            latestNavInfo = navInfo;
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error reading NavInfo: " + e.getMessage());
                    }
                }
            }
        });
    }

    @Override
    public IBinder onBind(Intent intent) {
        return messenger.getBinder();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        latestNavInfo = null;
    }
}
