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
 * microphone can stay open while Gemini's TTS is playing back (full duplex).
 *
 * Two modes:
 * - "single": one shared channel ("main"). Capture uses
 *   MediaRecorder.AudioSource.VOICE_COMMUNICATION with AcousticEchoCanceler/NoiseSuppressor
 *   attached; playback goes through an AudioTrack with USAGE_VOICE_COMMUNICATION; AudioManager
 *   is put into MODE_IN_COMMUNICATION with speakerphone routing so the platform AEC has a
 *   reference signal for the speaker output. Behaviour identical to the pre-dual-mode plugin.
 * - "dual": two independent channels running concurrently on one device. The "staff" channel
 *   is routed to a connected headset (Bluetooth SCO/BLE/wired/USB) via
 *   AudioManager#setCommunicationDevice, so a VOICE_COMMUNICATION AudioRecord/AudioTrack pair
 *   follows the headset mic/speaker. The "patient" channel is pinned to the phone's built-in
 *   mic/speaker via AudioRecord#setPreferredDevice / AudioTrack#setPreferredDevice using
 *   VOICE_RECOGNITION capture (so it does not also follow the communication device) and a
 *   USAGE_MEDIA AudioTrack. Requires API 31+ and a connected headset; the JS side is
 *   responsible for falling back to single mode when dual mode is rejected.
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
    private static final long ROUTING_EVENT_DELAY_MS = 1000;

    private static final String CHANNEL_MAIN = "main";
    private static final String CHANNEL_STAFF = "staff";
    private static final String CHANNEL_PATIENT = "patient";

    private final Object lock = new Object();

    private volatile boolean running = false;
    private volatile String mode = "single";

    private AudioManager audioManager;

    // Single-mode channel (also used as the generic holder in dual mode).
    private AudioChannel mainChannel;
    private AudioChannel staffChannel;
    private AudioChannel patientChannel;

    private AudioDeviceInfo previousCommunicationDevice = null;
    private int previousAudioMode = AudioManager.MODE_NORMAL;

    private final android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());

    // ---------------------------------------------------------------------------------------
    // AudioChannel: one capture + playback pipeline (mic in / speaker out).
    // ---------------------------------------------------------------------------------------

    private class AudioChannel {
        final String name;
        AudioRecord audioRecord;
        AudioTrack audioTrack;
        AcousticEchoCanceler echoCanceler;
        NoiseSuppressor noiseSuppressor;

        volatile boolean running = false;
        volatile boolean playing = false;

        Thread captureThread;
        Thread playbackThread;

        final LinkedBlockingQueue<byte[]> playbackQueue = new LinkedBlockingQueue<>();

        AudioChannel(String name) {
            this.name = name;
        }

        void startCaptureAndPlayback() {
            running = true;

            captureThread = new Thread(this::captureLoop, "NativeAudio-Capture-" + name);
            captureThread.setDaemon(true);
            captureThread.start();

            playbackThread = new Thread(this::playbackLoop, "NativeAudio-Playback-" + name);
            playbackThread.setDaemon(true);
            playbackThread.start();
        }

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
                data.put("channel", name);
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
                        emitPlaybackState(name, true);
                    }
                    track.write(chunk, 0, chunk.length);
                } else if (playing) {
                    playing = false;
                    emitPlaybackState(name, false);
                }
            }
        }

        void stopPlayback() {
            playbackQueue.clear();
            try {
                if (audioTrack != null) {
                    audioTrack.pause();
                    audioTrack.flush();
                    audioTrack.play();
                }
            } catch (Exception e) {
                Log.e(TAG, "stopPlayback failed for channel " + name, e);
            }
            if (playing) {
                playing = false;
                emitPlaybackState(name, false);
            }
        }

        void teardown() {
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
        }
    }

    private void emitPlaybackState(String channel, boolean isPlaying) {
        JSObject data = new JSObject();
        data.put("playing", isPlaying);
        data.put("channel", channel);
        notifyListeners("playbackState", data);
    }

    // ---------------------------------------------------------------------------------------
    // Plugin methods
    // ---------------------------------------------------------------------------------------

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("microphone permission not granted");
            return;
        }

        String requestedMode = call.getString("mode", "single");
        boolean dual = "dual".equals(requestedMode);

        synchronized (lock) {
            if (running) {
                call.resolve(buildStartResult());
                return;
            }

            try {
                if (dual) {
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                        call.reject("unsupported_api");
                        return;
                    }
                    startDual();
                } else {
                    startSingle();
                }

                running = true;
                mode = dual ? "dual" : "single";

                JSObject result = buildStartResult();
                Log.i(TAG, "start: running mode=" + mode);
                call.resolve(result);

                // Re-query routed devices after audio has actually started flowing.
                mainHandler.postDelayed(() -> {
                    synchronized (lock) {
                        if (!running) {
                            return;
                        }
                        JSObject routing = buildStartResult();
                        notifyListeners("routing", routing);
                    }
                }, ROUTING_EVENT_DELAY_MS);
            } catch (NoHeadsetException e) {
                Log.w(TAG, "start (dual) failed: no headset");
                teardownAll();
                call.reject("no_headset");
            } catch (Exception e) {
                Log.e(TAG, "start failed", e);
                teardownAll();
                call.reject(e.getMessage(), e);
            }
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (lock) {
            teardownAll();
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
        String channelName = call.getString("channel", "single".equals(mode) ? CHANNEL_MAIN : null);

        AudioChannel channel = resolveChannel(channelName);
        if (channel == null) {
            call.reject("unknown channel");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
            channel.playbackQueue.offer(bytes);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "playPcm failed", e);
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        String channelName = call.getString("channel", null);

        if (channelName == null) {
            // Stop all active channels.
            if (mainChannel != null) mainChannel.stopPlayback();
            if (staffChannel != null) staffChannel.stopPlayback();
            if (patientChannel != null) patientChannel.stopPlayback();
            call.resolve();
            return;
        }

        AudioChannel channel = resolveChannel(channelName);
        if (channel == null) {
            call.reject("unknown channel");
            return;
        }
        channel.stopPlayback();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            teardownAll();
        }
        super.handleOnDestroy();
    }

    private AudioChannel resolveChannel(String channelName) {
        if (channelName == null) {
            return null;
        }
        if ("single".equals(mode)) {
            return CHANNEL_MAIN.equals(channelName) ? mainChannel : null;
        }
        // dual mode
        if (CHANNEL_STAFF.equals(channelName)) {
            return staffChannel;
        }
        if (CHANNEL_PATIENT.equals(channelName)) {
            return patientChannel;
        }
        return null;
    }

    // ---------------------------------------------------------------------------------------
    // Single-mode setup (unchanged behaviour)
    // ---------------------------------------------------------------------------------------

    private void startSingle() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        previousAudioMode = audioManager.getMode();
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            previousCommunicationDevice = audioManager.getCommunicationDevice();
            AudioDeviceInfo speaker = findBuiltInSpeakerForCommunication();
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

        AudioChannel channel = new AudioChannel(CHANNEL_MAIN);
        setupVoiceCommunicationRecord(channel);
        setupVoiceCommunicationTrack(channel);
        channel.startCaptureAndPlayback();
        mainChannel = channel;
    }

    private AudioDeviceInfo findBuiltInSpeakerForCommunication() {
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

    // ---------------------------------------------------------------------------------------
    // Dual-mode setup
    // ---------------------------------------------------------------------------------------

    private static class NoHeadsetException extends RuntimeException {
    }

    private void startDual() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        previousAudioMode = audioManager.getMode();
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        previousCommunicationDevice = audioManager.getCommunicationDevice();

        AudioDeviceInfo headset = findHeadsetForCommunication();
        if (headset == null) {
            throw new NoHeadsetException();
        }
        boolean setOk = audioManager.setCommunicationDevice(headset);
        Log.i(TAG, "startDual: setCommunicationDevice(headset=" + headset.getType() + ") success=" + setOk);

        AudioChannel staff = new AudioChannel(CHANNEL_STAFF);
        AudioChannel patient = new AudioChannel(CHANNEL_PATIENT);
        try {
            // Staff channel: follows the communication device (headset) via
            // VOICE_COMMUNICATION source / USAGE_VOICE_COMMUNICATION track.
            setupVoiceCommunicationRecord(staff);
            setupVoiceCommunicationTrack(staff);

            // Patient channel: pinned to the phone's built-in mic/speaker.
            setupPatientRecord(patient);
            setupPatientTrack(patient);

            staff.startCaptureAndPlayback();
            patient.startCaptureAndPlayback();

            staffChannel = staff;
            patientChannel = patient;
        } catch (Exception e) {
            staff.teardown();
            patient.teardown();
            throw e;
        }
    }

    private AudioDeviceInfo findHeadsetForCommunication() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return null;
        }
        List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
        AudioDeviceInfo bluetoothSco = null;
        AudioDeviceInfo bleHeadset = null;
        AudioDeviceInfo wiredHeadset = null;
        AudioDeviceInfo usbHeadset = null;
        for (AudioDeviceInfo device : devices) {
            int type = device.getType();
            if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
                bluetoothSco = device;
            } else if (type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                bleHeadset = device;
            } else if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET) {
                wiredHeadset = device;
            } else if (type == AudioDeviceInfo.TYPE_USB_HEADSET) {
                usbHeadset = device;
            }
        }
        if (bluetoothSco != null) return bluetoothSco;
        if (bleHeadset != null) return bleHeadset;
        if (wiredHeadset != null) return wiredHeadset;
        return usbHeadset;
    }

    private AudioDeviceInfo findBuiltInMicInput() {
        AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS);
        for (AudioDeviceInfo device : devices) {
            if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
                return device;
            }
        }
        return null;
    }

    private AudioDeviceInfo findBuiltInSpeakerOutput() {
        AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        for (AudioDeviceInfo device : devices) {
            if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                return device;
            }
        }
        return null;
    }

    private void setupPatientRecord(AudioChannel channel) {
        int minBufferSize = AudioRecord.getMinBufferSize(
            CAPTURE_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBufferSize, 4 * 4096);

        AudioRecord record = new AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            CAPTURE_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        );

        if (record.getState() != AudioRecord.STATE_INITIALIZED) {
            record.release();
            throw new IllegalStateException("AudioRecord (patient) failed to initialize");
        }

        channel.audioRecord = record;

        AudioDeviceInfo builtinMic = findBuiltInMicInput();
        if (builtinMic != null) {
            boolean ok = record.setPreferredDevice(builtinMic);
            Log.i(TAG, "patient setPreferredDevice(builtinMic) success=" + ok);
        } else {
            Log.w(TAG, "patient: no built-in mic input device found");
        }

        int sessionId = record.getAudioSessionId();

        if (AcousticEchoCanceler.isAvailable()) {
            AcousticEchoCanceler aec = AcousticEchoCanceler.create(sessionId);
            if (aec != null) {
                int result = aec.setEnabled(true);
                Log.i(TAG, "patient AcousticEchoCanceler enabled, result=" + result);
                channel.echoCanceler = aec;
            } else {
                Log.w(TAG, "patient AcousticEchoCanceler.create returned null");
            }
        } else {
            Log.w(TAG, "patient AcousticEchoCanceler not available on this device");
        }

        if (NoiseSuppressor.isAvailable()) {
            NoiseSuppressor ns = NoiseSuppressor.create(sessionId);
            if (ns != null) {
                int result = ns.setEnabled(true);
                Log.i(TAG, "patient NoiseSuppressor enabled, result=" + result);
                channel.noiseSuppressor = ns;
            } else {
                Log.w(TAG, "patient NoiseSuppressor.create returned null");
            }
        } else {
            Log.w(TAG, "patient NoiseSuppressor not available on this device");
        }

        record.startRecording();
    }

    private void setupPatientTrack(AudioChannel channel) {
        int minBufferSize = AudioTrack.getMinBufferSize(
            PLAYBACK_SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBufferSize, PLAYBACK_SAMPLE_RATE * 2 / 5); // ~200ms

        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();

        AudioFormat format = new AudioFormat.Builder()
            .setSampleRate(PLAYBACK_SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .build();

        AudioTrack track = new AudioTrack(
            attributes,
            format,
            bufferSize,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        );

        if (track.getState() != AudioTrack.STATE_INITIALIZED) {
            track.release();
            throw new IllegalStateException("AudioTrack (patient) failed to initialize");
        }

        channel.audioTrack = track;

        AudioDeviceInfo builtinSpeaker = findBuiltInSpeakerOutput();
        if (builtinSpeaker != null) {
            boolean ok = track.setPreferredDevice(builtinSpeaker);
            Log.i(TAG, "patient setPreferredDevice(builtinSpeaker) success=" + ok);
        } else {
            Log.w(TAG, "patient: no built-in speaker output device found");
        }

        track.play();
    }

    // ---------------------------------------------------------------------------------------
    // Shared VOICE_COMMUNICATION record/track setup (single "main" channel and dual "staff")
    // ---------------------------------------------------------------------------------------

    private void setupVoiceCommunicationRecord(AudioChannel channel) {
        int minBufferSize = AudioRecord.getMinBufferSize(
            CAPTURE_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBufferSize, 4 * 4096);

        AudioRecord record = new AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            CAPTURE_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        );

        if (record.getState() != AudioRecord.STATE_INITIALIZED) {
            record.release();
            throw new IllegalStateException("AudioRecord (" + channel.name + ") failed to initialize");
        }

        channel.audioRecord = record;

        int sessionId = record.getAudioSessionId();

        if (AcousticEchoCanceler.isAvailable()) {
            AcousticEchoCanceler aec = AcousticEchoCanceler.create(sessionId);
            if (aec != null) {
                int result = aec.setEnabled(true);
                Log.i(TAG, channel.name + " AcousticEchoCanceler available and enabled, result=" + result);
                channel.echoCanceler = aec;
            } else {
                Log.w(TAG, channel.name + " AcousticEchoCanceler.create returned null");
            }
        } else {
            Log.w(TAG, channel.name + " AcousticEchoCanceler not available on this device");
        }

        if (NoiseSuppressor.isAvailable()) {
            NoiseSuppressor ns = NoiseSuppressor.create(sessionId);
            if (ns != null) {
                int result = ns.setEnabled(true);
                Log.i(TAG, channel.name + " NoiseSuppressor available and enabled, result=" + result);
                channel.noiseSuppressor = ns;
            } else {
                Log.w(TAG, channel.name + " NoiseSuppressor.create returned null");
            }
        } else {
            Log.w(TAG, channel.name + " NoiseSuppressor not available on this device");
        }

        record.startRecording();
    }

    private void setupVoiceCommunicationTrack(AudioChannel channel) {
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

        AudioTrack track = new AudioTrack(
            attributes,
            format,
            bufferSize,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        );

        if (track.getState() != AudioTrack.STATE_INITIALIZED) {
            track.release();
            throw new IllegalStateException("AudioTrack (" + channel.name + ") failed to initialize");
        }

        channel.audioTrack = track;
        track.play();
    }

    // ---------------------------------------------------------------------------------------
    // Device routing reporting
    // ---------------------------------------------------------------------------------------

    private JSObject buildStartResult() {
        JSObject result = new JSObject();
        result.put("mode", mode);

        JSObject devices = new JSObject();
        if ("dual".equals(mode)) {
            devices.put("staffIn", describeRoutedInput(staffChannel));
            devices.put("staffOut", describeRoutedOutput(staffChannel));
            devices.put("patientIn", describeRoutedInput(patientChannel));
            devices.put("patientOut", describeRoutedOutput(patientChannel));
        } else {
            devices.put("staffIn", describeRoutedInput(mainChannel));
            devices.put("staffOut", describeRoutedOutput(mainChannel));
            devices.put("patientIn", "none");
            devices.put("patientOut", "none");
        }
        result.put("devices", devices);
        return result;
    }

    private String describeRoutedInput(AudioChannel channel) {
        if (channel == null || channel.audioRecord == null) {
            return "none";
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return "UNKNOWN";
        }
        try {
            AudioDeviceInfo device = channel.audioRecord.getRoutedDevice();
            return describeDevice(device);
        } catch (Exception e) {
            Log.w(TAG, "describeRoutedInput failed for " + channel.name, e);
            return "none";
        }
    }

    private String describeRoutedOutput(AudioChannel channel) {
        if (channel == null || channel.audioTrack == null) {
            return "none";
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return "UNKNOWN";
        }
        try {
            AudioDeviceInfo device = channel.audioTrack.getRoutedDevice();
            return describeDevice(device);
        } catch (Exception e) {
            Log.w(TAG, "describeRoutedOutput failed for " + channel.name, e);
            return "none";
        }
    }

    private String describeDevice(AudioDeviceInfo device) {
        if (device == null) {
            return "none";
        }
        int type = device.getType();
        switch (type) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                return "BLUETOOTH_SCO";
            case AudioDeviceInfo.TYPE_BLE_HEADSET:
                return "BLE_HEADSET";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                return "WIRED_HEADSET";
            case AudioDeviceInfo.TYPE_USB_HEADSET:
                return "USB_HEADSET";
            case AudioDeviceInfo.TYPE_BUILTIN_MIC:
                return "BUILTIN_MIC";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return "BUILTIN_SPEAKER";
            default:
                return "UNKNOWN(" + type + ")";
        }
    }

    // ---------------------------------------------------------------------------------------
    // Teardown
    // ---------------------------------------------------------------------------------------

    private void teardownAll() {
        if (!running && mainChannel == null && staffChannel == null && patientChannel == null) {
            return;
        }

        running = false;

        if (mainChannel != null) {
            mainChannel.teardown();
            mainChannel = null;
        }
        if (staffChannel != null) {
            staffChannel.teardown();
            staffChannel = null;
        }
        if (patientChannel != null) {
            patientChannel.teardown();
            patientChannel = null;
        }

        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
            audioManager.setMode(previousAudioMode);
        }

        mode = "single";

        Log.i(TAG, "stop: teardown complete");
    }
}
