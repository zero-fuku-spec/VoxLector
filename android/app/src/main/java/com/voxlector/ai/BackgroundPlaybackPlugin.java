package com.voxlector.ai;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(
    name = "BackgroundPlayback",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class BackgroundPlaybackPlugin extends Plugin {
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            call.reject("Notificaciones de reproducción no permitidas.");
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "VoxLector");
        Intent intent = new Intent(getContext(), PlaybackForegroundService.class);
        intent.setAction(PlaybackForegroundService.ACTION_START);
        intent.putExtra(PlaybackForegroundService.EXTRA_TITLE, title);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (RuntimeException exception) {
            call.reject("No se pudo iniciar el servicio de audio en segundo plano.", exception);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), PlaybackForegroundService.class);
        try {
            getContext().stopService(intent);
            call.resolve();
        } catch (RuntimeException exception) {
            call.reject("No se pudo detener el servicio de audio en segundo plano.", exception);
        }
    }
}
