package com.voxlector.ai;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "NativeAudioSynthesis")
public class NativeAudioSynthesisPlugin extends Plugin {
    private static final int MAX_TEXT_LENGTH = 4000;
    private static final int MAX_AUDIO_BYTES = 6 * 1024 * 1024;
    private final ConcurrentHashMap<String, PendingSynthesis> pending = new ConcurrentHashMap<>();
    private volatile TextToSpeech textToSpeech;
    private volatile boolean initialized;
    private volatile String initializationError;

    @Override
    public void load() {
        textToSpeech = new TextToSpeech(getContext(), status -> {
            initialized = status == TextToSpeech.SUCCESS;
            if (!initialized) initializationError = "El motor de síntesis de Android no pudo inicializarse.";
        });
    }

    @PluginMethod
    public void synthesize(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("No hay texto para sintetizar.");
            return;
        }
        if (text.length() > MAX_TEXT_LENGTH) {
            call.reject("El bloque supera el límite seguro de síntesis.");
            return;
        }
        waitForEngine(call, text, 0);
    }

    private void waitForEngine(PluginCall call, String text, int attempt) {
        if (initialized) {
            synthesizeReady(call, text);
            return;
        }
        if (initializationError != null || attempt >= 40) {
            call.reject(initializationError != null ? initializationError : "El motor de síntesis tarda demasiado en inicializarse.");
            return;
        }
        getActivity().runOnUiThread(() -> getActivity().getWindow().getDecorView().postDelayed(
            () -> waitForEngine(call, text, attempt + 1), 100
        ));
    }

    private void synthesizeReady(PluginCall call, String text) {
        TextToSpeech engine = textToSpeech;
        if (engine == null) {
            call.reject("El motor de síntesis ya no está disponible.");
            return;
        }

        String languageTag = call.getString("lang", "es-ES");
        float rate = clamp(call.getFloat("rate", 1.0f), 0.5f, 2.0f);
        float pitch = clamp(call.getFloat("pitch", 1.0f), 0.5f, 2.0f);
        float volume = clamp(call.getFloat("volume", 1.0f), 0.0f, 1.0f);
        String voiceName = call.getString("voiceName", "");
        int languageResult = engine.setLanguage(Locale.forLanguageTag(languageTag));
        if (languageResult == TextToSpeech.LANG_MISSING_DATA || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("El motor TTS no admite el idioma " + languageTag + ".");
            return;
        }
        if (!voiceName.isEmpty()) {
            boolean matchedVoice = false;
            for (Voice voice : engine.getVoices()) {
                if (voiceName.equals(voice.getName())) {
                    int voiceResult = engine.setVoice(voice);
                    if (voiceResult != TextToSpeech.SUCCESS) {
                        call.reject("Android no pudo activar exactamente la voz seleccionada: " + voiceName);
                        return;
                    }
                    matchedVoice = true;
                    break;
                }
            }
            if (!matchedVoice) {
                call.reject("La voz seleccionada ya no está disponible en el motor Android: " + voiceName);
                return;
            }
        }
        engine.setSpeechRate(rate);
        engine.setPitch(pitch);

        String utteranceId = UUID.randomUUID().toString();
        File outputFile = new File(getContext().getCacheDir(), "tts-" + utteranceId + ".wav");
        PendingSynthesis request = new PendingSynthesis(call, outputFile, volume);
        pending.put(utteranceId, request);
        engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) { }

            @Override
            public void onDone(String id) {
                PendingSynthesis completed = pending.remove(id);
                if (completed == null) return;
                try {
                    byte[] audioBytes = readAudioFile(completed.file);
                    if (audioBytes.length == 0 || audioBytes.length > MAX_AUDIO_BYTES) {
                        completed.call.reject("El audio sintetizado está vacío o supera el tamaño permitido.");
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("audioBase64", Base64.encodeToString(audioBytes, Base64.NO_WRAP));
                    result.put("mimeType", "audio/wav");
                    completed.call.resolve(result);
                } catch (Exception exception) {
                    completed.call.reject("No se pudo leer el audio sintetizado.", exception);
                } finally {
                    if (completed.file.exists()) completed.file.delete();
                }
            }

            @Override
            public void onError(String id) {
                rejectPending(id, "Android no pudo sintetizar el bloque de texto.");
            }

            @Override
            public void onError(String id, int errorCode) {
                rejectPending(id, "Android no pudo sintetizar el bloque de texto (código " + errorCode + ").");
            }
        });

        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, request.volume);
        int result = engine.synthesizeToFile(text, params, outputFile, utteranceId);
        if (result == TextToSpeech.ERROR) rejectPending(utteranceId, "Android rechazó la solicitud de síntesis.");
    }

    private void rejectPending(String id, String message) {
        PendingSynthesis failed = pending.remove(id);
        if (failed == null) return;
        failed.call.reject(message);
        if (failed.file.exists()) failed.file.delete();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        TextToSpeech engine = textToSpeech;
        if (engine != null) engine.stop();
        for (String id : pending.keySet()) rejectPending(id, "Síntesis cancelada.");
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        TextToSpeech engine = textToSpeech;
        textToSpeech = null;
        initialized = false;
        if (engine != null) {
            engine.stop();
            engine.shutdown();
        }
        for (String id : pending.keySet()) rejectPending(id, "La aplicación se cerró durante la síntesis.");
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private static byte[] readAudioFile(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int count;
            while ((count = input.read(chunk)) != -1) {
                if (output.size() + count > MAX_AUDIO_BYTES) {
                    throw new IllegalArgumentException("El audio sintetizado supera el tamaño permitido.");
                }
                output.write(chunk, 0, count);
            }
            return output.toByteArray();
        }
    }

    private static final class PendingSynthesis {
        final PluginCall call;
        final File file;
        final float volume;

        PendingSynthesis(PluginCall call, File file, float volume) {
            this.call = call;
            this.file = file;
            this.volume = volume;
        }
    }
}
