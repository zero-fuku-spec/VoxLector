package com.voxlector.ai;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeTtsSettings")
public class NativeTtsSettingsPlugin extends Plugin {
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent ttsSettings = new Intent("com.android.settings.TTS_SETTINGS");
        ttsSettings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(ttsSettings);
            call.resolve();
            return;
        } catch (ActivityNotFoundException error) {
            Intent accessibilitySettings = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            accessibilitySettings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(accessibilitySettings);
                call.resolve();
            } catch (ActivityNotFoundException fallbackError) {
                call.reject("No se encontraron ajustes de TTS ni de accesibilidad en Android.", fallbackError);
            }
        }
    }
}
