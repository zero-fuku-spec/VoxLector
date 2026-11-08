package com.voxlector.ai;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BackgroundPlaybackPlugin.class);
        registerPlugin(NativeAudioSynthesisPlugin.class);
        registerPlugin(NativeTtsSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
