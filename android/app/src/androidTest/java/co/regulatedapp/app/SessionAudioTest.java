package co.regulatedapp.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.media.AudioManager;
import android.net.Uri;
import android.os.IBinder;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.audio.AudioFocusRequestCompat;
import androidx.media3.common.audio.AudioManagerCompat;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import org.junit.Test;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@androidx.media3.common.util.UnstableApi
public class SessionAudioTest {
    private SessionAudioService owner;
    private void main(Runnable work) { InstrumentationRegistry.getInstrumentation().runOnMainSync(work); }
    private JSObject state(String token) {
        AtomicReference<JSObject> value = new AtomicReference<>();
        main(() -> value.set(owner.snapshot(token)));
        return value.get();
    }
    private JSObject waitFor(String token, String status) throws Exception {
        for (int i = 0; i < 80; i++) {
            JSObject value = state(token);
            if (status.equals(value.optString("status"))) return value;
            Thread.sleep(100);
        }
        fail("Playback never reached " + status + ", got " + state(token).optString("status"));
        return null;
    }
    private String fixture(Context context) throws Exception {
        int samples = 16000 * 4;
        ByteBuffer data = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN);
        data.put(new byte[]{'R','I','F','F'}).putInt(36 + samples * 2).put(new byte[]{'W','A','V','E','f','m','t',' '});
        data.putInt(16).putShort((short) 1).putShort((short) 1).putInt(16000).putInt(32000).putShort((short) 2).putShort((short) 16);
        data.put(new byte[]{'d','a','t','a'}).putInt(samples * 2);
        while (data.hasRemaining()) data.putShort((short) 0);
        File file = new File(context.getCacheDir(), "session-audio-test.wav");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(data.array()); }
        return Uri.fromFile(file).toString();
    }

    @Test public void nativeOwnerRetainsOnlyNaturalEndAndRejectsStaleOwners() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (ActivityScenario<MainActivity> screen = ActivityScenario.launch(MainActivity.class)) {
            CountDownLatch connected = new CountDownLatch(1);
            ServiceConnection connection = new ServiceConnection() {
                @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                    owner = ((SessionAudioService.LocalBinder) binder).service();
                    connected.countDown();
                }
                @Override public void onServiceDisconnected(ComponentName name) {}
            };
            Intent bind = new Intent(context, SessionAudioService.class).setAction(SessionAudioService.LOCAL_BIND);
            assertTrue(context.bindService(bind, connection, Context.BIND_AUTO_CREATE));
            assertTrue(connected.await(5, TimeUnit.SECONDS));
            String url = fixture(context);
            try {
                main(() -> owner.open("first", "fixture", "Test audio", url));
                main(() -> owner.command("first", "play", 0));
                waitFor("first", "playing");
                main(() -> owner.open("second", "fixture", "Test audio", url));
                main(() -> owner.close("first"));
                assertEquals("second", state("second").getString("token"));
                main(() -> owner.command("second", "play", 0));
                waitFor("second", "playing");
                main(() -> owner.command("second", "pause", 0));
                assertTrue(state("second").isNull("outcome"));
                main(() -> owner.command("second", "seek", 4));
                Thread.sleep(300);
                assertTrue(state("second").isNull("outcome"));
                assertEquals("paused", state("second").getString("status"));
                main(() -> owner.command("second", "play", 0));
                assertEquals("paused", state("second").getString("status"));
                main(() -> owner.command("second", "seek", 0));
                main(() -> owner.command("second", "play", 0));
                waitFor("second", "playing");

                AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                AudioFocusRequestCompat interruption = new AudioFocusRequestCompat.Builder(AudioManagerCompat.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build())
                    .setOnAudioFocusChangeListener(change -> {}).build();
                main(() -> assertEquals(AudioManager.AUDIOFOCUS_REQUEST_GRANTED, AudioManagerCompat.requestAudioFocus(audio, interruption)));
                waitFor("second", "paused");
                main(() -> AudioManagerCompat.abandonAudioFocusRequest(audio, interruption));
                Thread.sleep(300);
                assertEquals("paused", state("second").getString("status"));
                assertTrue(state("second").isNull("outcome"));
                main(() -> owner.command("second", "seek", 0));
                main(() -> owner.command("second", "play", 0));
                waitFor("second", "playing");
                screen.onActivity(activity -> activity.moveTaskToBack(true));
                JSObject ended = waitFor("second", "ended");
                assertEquals("ended", ended.getJSObject("outcome").getString("kind"));
                long serial = ended.getJSObject("outcome").getLong("serial");
                main(() -> owner.command("second", "play", 0));
                assertEquals(serial, state("second").getJSObject("outcome").getLong("serial"));
                assertTrue(state("second").getLong("revision") > ended.getLong("revision"));

                context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                Thread.sleep(500);
                main(() -> owner.open("remote", "fixture", "Test audio", url));
                AtomicReference<com.google.common.util.concurrent.ListenableFuture<MediaController>> future = new AtomicReference<>();
                main(() -> future.set(new MediaController.Builder(context, new SessionToken(context, new ComponentName(context, SessionAudioService.class))).buildAsync()));
                MediaController controller = future.get().get(5, TimeUnit.SECONDS);
                try {
                    main(controller::play);
                    waitFor("remote", "playing");
                    screen.onActivity(activity -> activity.moveTaskToBack(true));
                    main(controller::pause);
                    waitFor("remote", "paused");
                    main(controller::play);
                    waitFor("remote", "playing");
                    main(controller::pause);
                    waitFor("remote", "paused");
                    main(() -> controller.seekTo(4000));
                    Thread.sleep(300);
                    assertTrue(state("remote").isNull("outcome"));
                    main(controller::stop);
                    assertTrue(state("remote").isNull("outcome"));
                    main(() -> controller.seekTo(0));
                    main(controller::play);
                    waitFor("remote", "playing");
                    Thread.sleep(300);
                    AtomicReference<JSObject> closed = new AtomicReference<>();
                    main(() -> closed.set(owner.close("remote")));
                    assertTrue(closed.get().getDouble("position") > 0);
                    assertTrue(closed.get().isNull("outcome"));
                    Thread.sleep(300);
                    assertEquals("closed", state("remote").getString("status"));
                    assertTrue(state("remote").isNull("outcome"));
                } finally { main(controller::release); }
                main(() -> owner.open("failure", "fixture", "Test audio", "file:///nonexistent-regulated-audio.wav"));
                JSObject failure = waitFor("failure", "error");
                assertEquals("error", failure.getJSObject("outcome").getString("kind"));
                main(() -> owner.command("failure", "play", 0));
                assertEquals("error", state("failure").getString("status"));
                main(() -> owner.close("failure"));
            } finally { context.unbindService(connection); }
        }
    }
}
