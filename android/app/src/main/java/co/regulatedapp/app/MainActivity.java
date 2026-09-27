package co.regulatedapp.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

@androidx.media3.common.util.UnstableApi
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(SessionAudioPlugin.class);
        super.onCreate(state);
    }
}
