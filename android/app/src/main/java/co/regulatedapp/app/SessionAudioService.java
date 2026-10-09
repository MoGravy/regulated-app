package co.regulatedapp.app;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.audio.AudioFocusRequestCompat;
import androidx.media3.common.audio.AudioManagerCompat;
import android.media.AudioManager;
import android.os.Binder;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import com.getcapacitor.JSObject;
import java.util.function.Consumer;

@androidx.media3.common.util.UnstableApi
public class SessionAudioService extends MediaSessionService {
    static final String LOCAL_BIND = "co.regulatedapp.app.SESSION_AUDIO";
    final class LocalBinder extends Binder { SessionAudioService service() { return SessionAudioService.this; } }
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private MediaSession mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequestCompat focusRequest;
    private String token = "", sessionId = "", status = "closed";
    private JSObject outcome;
    private long revision;
    private double position, duration;
    private boolean seekAtEnd;
    private boolean seeking;
    private ListeningEvidence evidence = new ListeningEvidence(0);
    private final Runnable evidenceTimer = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            publish();
            handler.postDelayed(this, 1000);
        }
    };
    Consumer<JSObject> observer;

    @Override public void onCreate() {
        super.onCreate();
        androidx.media3.common.util.Log.setLogLevel(androidx.media3.common.util.Log.LOG_LEVEL_OFF);
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        focusRequest = new AudioFocusRequestCompat.Builder(AudioManagerCompat.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build())
            .setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener(change -> { if (change < 0) pause(); }, handler).build();
    }

    @Override public IBinder onBind(Intent intent) {
        if (LOCAL_BIND.equals(intent.getAction())) return new LocalBinder();
        return super.onBind(intent);
    }

    @Override public MediaSession onGetSession(MediaSession.ControllerInfo info) { return mediaSession; }

    JSObject open(String nextToken, String id, String title, String url) {
        return open(nextToken, id, title, url, 0);
    }

    JSObject open(String nextToken, String id, String title, String url, double priorCreditSeconds) {
        releasePlayer();
        token = nextToken;
        sessionId = id;
        outcome = null;
        position = 0;
        duration = 0;
        seekAtEnd = false;
        seeking = false;
        evidence = new ListeningEvidence(priorCreditSeconds);
        status = "loading";
        final ExoPlayer current = new ExoPlayer.Builder(this).build();
        player = current;
        current.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), false);
        current.setHandleAudioBecomingNoisy(true);
        current.setWakeMode(C.WAKE_MODE_LOCAL);
        current.addListener(new Player.Listener() {
            private boolean owns() { return player == current && token.equals(nextToken); }
            @Override public void onEvents(Player p, Player.Events events) {
                if (!owns() || outcome != null) return;
                sample();
                if (current.getPlaybackState() == Player.STATE_ENDED) {
                    if (!seekAtEnd && current.getPlayWhenReady()) {
                        status = "ended";
                        outcome = new JSObject().put("kind", "ended").put("serial", ++revision);
                        current.pause();
                        AudioManagerCompat.abandonAudioFocusRequest(audioManager, focusRequest);
                    } else status = "paused";
                } else if (current.isPlaying()) status = "playing";
                else if (current.getPlayWhenReady()) status = "buffering";
                else status = "paused";
                publish();
            }
            @Override public void onPlayerError(PlaybackException error) {
                if (!owns()) return;
                fail();
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo oldPosition, Player.PositionInfo newPosition, int reason) {
                if (!owns()) return;
                seeking = false;
                sample(true);
                publish();
            }
        });
        ForwardingPlayer controls = new ForwardingPlayer(current) {
            private boolean owns() { return player == current && token.equals(nextToken); }
            @Override public void play() { if (owns()) SessionAudioService.this.play(); }
            @Override public void pause() { if (owns()) SessionAudioService.this.pause(); }
            @Override public void setPlayWhenReady(boolean value) { if (value) play(); else pause(); }
            @Override public void stop() { pause(); }
            @Override public void seekTo(long ms) { if (owns()) seek(ms / 1000.0); }
            @Override public void seekTo(int index, long ms) { if (owns()) seek(ms / 1000.0); }
            @Override public void seekBack() { if (owns()) seek((current.getCurrentPosition() - 15000) / 1000.0); }
            @Override public void seekForward() { if (owns()) seek((current.getCurrentPosition() + 15000) / 1000.0); }
            @Override public Player.Commands getAvailableCommands() {
                return new Player.Commands.Builder().addAll(
                    Player.COMMAND_PLAY_PAUSE, Player.COMMAND_STOP, Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
                    Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD, Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                    Player.COMMAND_GET_TIMELINE, Player.COMMAND_GET_METADATA, Player.COMMAND_GET_AUDIO_ATTRIBUTES,
                    Player.COMMAND_GET_VOLUME).build();
            }
            @Override public boolean isCommandAvailable(int command) { return getAvailableCommands().contains(command); }
        };
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent activity = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        mediaSession = new MediaSession.Builder(this, controls).setSessionActivity(activity).build();
        addSession(mediaSession);
        current.setMediaItem(new MediaItem.Builder().setMediaId(id).setUri(url)
            .setMediaMetadata(new MediaMetadata.Builder().setTitle(title).setArtist("Regulated").build()).build());
        current.prepare();
        handler.postDelayed(evidenceTimer, 1000);
        return snapshot(nextToken);
    }

    private void play() {
        if (player == null || outcome != null || seekAtEnd) return;
        if (AudioManagerCompat.requestAudioFocus(audioManager, focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) player.play();
        else pause();
    }

    private void pause() {
        if (player == null) return;
        sample();
        player.pause();
        AudioManagerCompat.abandonAudioFocusRequest(audioManager, focusRequest);
        if (outcome == null) status = "paused";
        publish();
    }

    private void seek(double seconds) {
        if (player == null || outcome != null || !Double.isFinite(seconds)) return;
        sample();
        if (duration <= 0) return;
        seeking = true;
        sample(true);
        seekAtEnd = seconds >= duration;
        if (seekAtEnd) pause();
        player.seekTo((long) (Math.max(0, Math.min(seconds, duration)) * 1000));
        publish();
    }

    JSObject command(String requested, String action, double seconds) {
        if (!token.equals(requested)) return new JSObject();
        switch (action) {
            case "play": play(); break;
            case "pause": pause(); break;
            case "seek": seek(seconds); break;
            default: throw new IllegalArgumentException("Invalid command");
        }
        return snapshot(requested);
    }

    JSObject snapshot(String requested) {
        if (!token.equals(requested)) return new JSObject();
        sample();
        return new JSObject().put("token", token).put("sessionId", sessionId).put("revision", ++revision)
            .put("status", status).put("position", position).put("duration", duration).put("outcome", outcome)
            .put("evidenceSource", "native-rendered").put("eligibleSeconds", evidence.seconds).put("atMs", evidence.atMs)
            .put("qualifiedAtMs", evidence.qualifiedAtMs).put("offsetMinutes", evidence.offsetMinutes)
            .put("lastRenderedAtMs", evidence.lastRenderedAtMs);
    }

    JSObject close(String requested) {
        if (!token.equals(requested)) return new JSObject();
        JSObject result = snapshot(requested);
        releasePlayer();
        status = "closed";
        stopSelf();
        return result;
    }

    private void sample() {
        sample(false);
    }

    private void sample(boolean discontinuity) {
        if (player == null) return;
        position = Math.max(0, player.getCurrentPosition()) / 1000.0;
        long length = player.getDuration();
        duration = length > 0 ? length / 1000.0 : 0;
        evidence.sample(position, SystemClock.elapsedRealtime(),
            player.isPlaying() && player.getVolume() > 0 && !seeking && outcome == null,
            discontinuity, duration, System.currentTimeMillis());
    }

    private void publish() { if (observer != null) observer.accept(snapshot(token)); }

    private void fail() {
        sample();
        outcome = new JSObject().put("kind", "error").put("code", "playback_failed");
        status = "error";
        player.pause();
        AudioManagerCompat.abandonAudioFocusRequest(audioManager, focusRequest);
        publish();
    }

    private void releasePlayer() {
        handler.removeCallbacks(evidenceTimer);
        ExoPlayer old = player;
        player = null;
        if (mediaSession != null) { removeSession(mediaSession); mediaSession.release(); mediaSession = null; }
        if (old != null) old.release();
        if (audioManager != null) AudioManagerCompat.abandonAudioFocusRequest(audioManager, focusRequest);
    }

    @Override public void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }
}
