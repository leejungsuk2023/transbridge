package kr.medtranslate.app;

import android.Manifest;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * NativeAudioPlugin
 *
 * Gives the WebView-based interpreter page OS-level acoustic echo cancellation so the
 * microphone can stay open while Gemini's TTS is playing back (full duplex). Capture uses
 * MediaRecorder.AudioSource.VOICE_COMMUNICATION with AcousticEchoCanceler/NoiseSuppressor
 * attached; playback goes through an AudioTrack with USAGE_VOICE_COMMUNICATION; AudioManager
 * is put into MODE_IN_COMMUNICATION with speakerphone routing so the platform AEC has a
 * reference signal for the speaker output.
 */
@CapacitorPlugin(
    name = "NativeAudio",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class NativeAudioPlugin extends Plugin {

    private static final String TAG = "NativeAudio";

    private static final int CAPTURE_SAMPLE_RATE = 16000;
    private static final int PLAYBACK_SAMPLE_RATE = 24000;
    private static final int CAPTURE_CHUNK_SHORTS = 2048; // 4096 bytes per chunk

    private final Object lock = new Object();

    private volatile boolean running = false;
    private volatile boolean playing = false;

    private AudioManager audioManager;
    private AudioRecord audioRecord;
    private AudioTrack audioTrack;
    private AcousticEchoCanceler echoCanceler;
    private NoiseSuppressor noiseSuppressor;

    private Thread captureThread;
    private Thread playbackThread;

    private final LinkedBlockingQueue<byte[]> playbackQueue = new LinkedBlockingQueue<>();

    private AudioDeviceInfo previousCommunicationDevice = null;
    private int previousAudioMode = AudioManager.MODE_NORMAL;

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("microphone permission not granted");
            return;
        }

        synchronized (lock) {
            if (running) {
                call.resolve();
                return;
            }

            try {
                setupAudioRouting();
                setupAudioRecord();
                setupAudioTrack();

                running = true;

                captureThread = new Thread(this::captureLoop, "NativeAudio-Capture");
                captureThread.setDaemon(true);
                captureThread.start();

                playbackThread = new Thread(this::playbackLoop, "NativeAudio-Playback");
                playbackThread.setDaemon(true);
                playbackThread.start();

                Log.i(TAG, "start: running");
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "start failed", e);
                teardown();
                call.reject(e.getMessage(), e);
            }
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (lock) {
            teardown();
        }
        call.resolve();
    }

    @PluginMethod
    public void playPcm(PluginCall call) {
        if (!running) {
            call.reject("not started");
            return;
        }
        String data = call.getString("data");
        if (data == null) {
            call.reject("data is required");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
            playbackQueue.offer(bytes);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "playPcm failed", e);
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        playbackQueue.clear();
        try {
            if (audioTrack != null) {
                audioTrack.pause();
                audioTrack.flush();
                audioTrack.play();
            }
        } catch (Exception e) {
            Log.e(TAG, "stopPlayback failed", e);
        }
        if (playing) {
            playing = false;
            JSObject data = new JSObject();
            data.put("playing", false);
            notifyListeners("playbackState", data);
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            teardown();
        }
        super.handleOnDestroy();
    }

    // ---------------------------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------------------------

    private void setupAudioRouting() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        previousAudioMode = audioManager.getMode();
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            previousCommunicationDevice = audioManager.getCommunicationDevice();
            AudioDeviceInfo speaker = findBuiltInSpeaker();
            if (speaker != null) {
                boolean ok = audioManager.setCommunicationDevice(speaker);
                Log.i(TAG, "setCommunicationDevice(speaker) success=" + ok);
                if (!ok) {
                    audioManager.setSpeakerphoneOn(true);
                }
            } else {
                audioManager.setSpeakerphoneOn(true);
            }
        } else {
            audioManager.setSpeakerphoneOn(true);
        }
    }

    private AudioDeviceInfo findBuiltInSpeaker() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return null;
        }
        List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
        for (AudioDeviceInfo device : devices) {
            if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                return device;
            }
        }
        return null;
    }

    private void setupAudioRecord() {
        int minBufferSize = AudioRecord.getMinBufferSize(
            CAPTURE_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBufferSize, 4 * 4096);

        audioRecord = new AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            CAPTURE_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        );

        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            audioRecord.release();
            audioRecord = null;
            throw new IllegalStateException("AudioRecord failed to initialize");
        }

        int sessionId = audioRecord.getAudioSessionId();

        if (AcousticEchoCanceler.isAvailable()) {
            echoCanceler = AcousticEchoCanceler.create(sessionId);
            if (echoCanceler != null) {
                int result = echoCanceler.setEnabled(true);
                Log.i(TAG, "AcousticEchoCanceler available and enabled, result=" + result);
            } else {
                Log.w(TAG, "AcousticEchoCanceler.create returned null");
            }
        } else {
            Log.w(TAG, "AcousticEchoCanceler not available on this device");
        }

        if (NoiseSuppressor.isAvailable()) {
            noiseSuppressor = NoiseSuppressor.create(sessionId);
            if (noiseSuppressor != null) {
                int result = noiseSuppressor.setEnabled(true);
                Log.i(TAG, "NoiseSuppressor available and enabled, result=" + result);
            } else {
                Log.w(TAG, "NoiseSuppressor.create returned null");
            }
        } else {
            Log.w(TAG, "NoiseSuppressor not available on this device");
        }

        audioRecord.startRecording();
    }

    private void setupAudioTrack() {
        int minBufferSize = AudioTrack.getMinBufferSize(
            PLAYBACK_SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBufferSize, PLAYBACK_SAMPLE_RATE * 2 / 5); // ~200ms

        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();

        AudioFormat format = new AudioFormat.Builder()
            .setSampleRate(PLAYBACK_SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .build();

        audioTrack = new AudioTrack(
            attributes,
            format,
            bufferSize,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        );

        if (audioTrack.getState() != AudioTrack.STATE_INITIALIZED) {
            audioTrack.release();
            audioTrack = null;
            throw new IllegalStateException("AudioTrack failed to initialize");
        }

        audioTrack.play();
    }

    // ---------------------------------------------------------------------------------------
    // Threads
    // ---------------------------------------------------------------------------------------

    private void captureLoop() {
        byte[] buffer = new byte[CAPTURE_CHUNK_SHORTS * 2];
        while (running) {
            AudioRecord record = audioRecord;
            if (record == null) {
                break;
            }
            int read = record.read(buffer, 0, buffer.length);
            if (read <= 0) {
                continue;
            }
            byte[] toSend = (read == buffer.length) ? buffer : java.util.Arrays.copyOf(buffer, read);
            String base64 = Base64.encodeToString(toSend, Base64.NO_WRAP);
            JSObject data = new JSObject();
            data.put("data", base64);
            notifyListeners("chunk", data);
        }
    }

    private void playbackLoop() {
        while (running) {
            byte[] chunk;
            try {
                chunk = playbackQueue.poll(300, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }

            AudioTrack track = audioTrack;
            if (track == null) {
                continue;
            }

            if (chunk != null) {
                if (!playing) {
                    playing = true;
                    JSObject data = new JSObject();
                    data.put("playing", true);
                    notifyListeners("playbackState", data);
                }
                track.write(chunk, 0, chunk.length);
            } else if (playing) {
                playing = false;
                JSObject data = new JSObject();
                data.put("playing", false);
                notifyListeners("playbackState", data);
            }
        }
    }

    // ---------------------------------------------------------------------------------------
    // Teardown
    // ---------------------------------------------------------------------------------------

    private void teardown() {
        if (!running && audioRecord == null && audioTrack == null) {
            return;
        }

        running = false;

        if (captureThread != null) {
            try {
                captureThread.join(500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            captureThread = null;
        }

        if (playbackThread != null) {
            try {
                playbackThread.join(500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            playbackThread = null;
        }

        playbackQueue.clear();
        playing = false;

        if (echoCanceler != null) {
            echoCanceler.release();
            echoCanceler = null;
        }
        if (noiseSuppressor != null) {
            noiseSuppressor.release();
            noiseSuppressor = null;
        }
        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (IllegalStateException ignored) {
                // already stopped
            }
            audioRecord.release();
            audioRecord = null;
        }
        if (audioTrack != null) {
            try {
                audioTrack.stop();
            } catch (IllegalStateException ignored) {
                // already stopped
            }
            audioTrack.release();
            audioTrack = null;
        }

        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
            audioManager.setMode(previousAudioMode);
        }

        Log.i(TAG, "stop: teardown complete");
    }
}
