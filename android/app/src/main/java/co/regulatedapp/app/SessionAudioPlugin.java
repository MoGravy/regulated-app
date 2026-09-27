package co.regulatedapp.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.IBinder;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

@CapacitorPlugin(name = "SessionAudio")
@androidx.media3.common.util.UnstableApi
public class SessionAudioPlugin extends Plugin {
    private SessionAudioService service;
    private boolean bound;
    private final List<Consumer<SessionAudioService>> pending = new ArrayList<>();
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((SessionAudioService.LocalBinder) binder).service();
            service.observer = state -> notifyListeners("playback", state);
            for (Consumer<SessionAudioService> work : pending) work.accept(service);
            pending.clear();
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; }
    };

    private void withService(PluginCall call, Consumer<SessionAudioService> work) {
        getActivity().runOnUiThread(() -> {
            Consumer<SessionAudioService> safe = owner -> {
                try { work.accept(owner); } catch (RuntimeException error) { call.reject("Playback unavailable"); }
            };
            if (service != null) { safe.accept(service); return; }
            pending.add(safe);
            if (bound) return;
            Intent intent = new Intent(getContext(), SessionAudioService.class).setAction(SessionAudioService.LOCAL_BIND);
            bound = getContext().bindService(intent, connection, Context.BIND_AUTO_CREATE);
            if (!bound) { pending.clear(); call.reject("Playback unavailable"); }
        });
    }

    @PluginMethod public void open(PluginCall call) {
        String token = call.getString("token"), id = call.getString("sessionId"), url = call.getString("url");
        if (token == null || token.isEmpty() || id == null || id.isEmpty() || url == null || !"https".equals(Uri.parse(url).getScheme())) {
            call.reject("Invalid session"); return;
        }
        withService(call, owner -> call.resolve(owner.open(token, id, call.getString("title", "Regulated"), url)));
    }
    @PluginMethod public void command(PluginCall call) {
        withService(call, owner -> call.resolve(owner.command(call.getString("token", ""), call.getString("action", ""), call.getDouble("position", 0.0))));
    }
    @PluginMethod public void snapshot(PluginCall call) {
        withService(call, owner -> call.resolve(owner.snapshot(call.getString("token", ""))));
    }
    @PluginMethod public void close(PluginCall call) {
        withService(call, owner -> call.resolve(owner.close(call.getString("token", ""))));
    }
    @Override protected void handleOnDestroy() {
        if (service != null) service.observer = null;
        if (bound) getContext().unbindService(connection);
        service = null;
        bound = false;
        super.handleOnDestroy();
    }
}
