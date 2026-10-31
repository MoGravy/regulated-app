package co.regulatedapp.app;

import android.os.Bundle;
import android.os.Build;
import android.content.res.Configuration;
import android.graphics.Color;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

@androidx.media3.common.util.UnstableApi
public class MainActivity extends BridgeActivity {
    private int appearanceColor = Color.parseColor("#EFEFF7");
    private boolean appearanceDark = false;

    @Override public void onCreate(Bundle state) {
        registerPlugin(SessionAudioPlugin.class);
        registerPlugin(NativeAppearancePlugin.class);
        super.onCreate(state);
    }

    void setNativeAppearance(int color, boolean dark) {
        appearanceColor = color;
        appearanceDark = dark;
        applyNativeAppearance();
    }

    @SuppressWarnings("deprecation")
    private void applyNativeAppearance() {
        getWindow().getDecorView().setBackgroundColor(appearanceColor);
        // API35+ status bars use the inset backdrop; older versions remain opaque.
        if (Build.VERSION.SDK_INT < 35) getWindow().setStatusBarColor(appearanceColor);
        // Dark navigation icons require API26; retain contrast on older devices.
        int navigationColor = Build.VERSION.SDK_INT < 26 && !appearanceDark
            ? Color.parseColor("#141521") : appearanceColor;
        getWindow().setNavigationBarColor(navigationColor);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!appearanceDark);
        bars.setAppearanceLightNavigationBars(!appearanceDark);
    }

    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        // Apply after Capacitor's SystemBars theme reset, preserving the active route.
        getWindow().getDecorView().post(this::applyNativeAppearance);
    }
}
