package co.regulatedapp.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.content.res.Configuration;
import android.os.Build;
import androidx.core.view.WindowCompat;
import androidx.test.core.app.ActivityScenario;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativeAppearanceTest {
    @Test public void paperWindowIncludesSystemBarInsets() {
        try (ActivityScenario<MainActivity> screen = ActivityScenario.launch(MainActivity.class)) {
            screen.onActivity(activity -> {
                assertEquals(Color.parseColor("#EFEFF7"),
                    ((ColorDrawable) activity.getWindow().getDecorView().getBackground()).getColor());
            });
        }
    }

    @Test public void activePlayerAndPaperKeepMatchingIconsAfterConfigurationChange() {
        try (ActivityScenario<MainActivity> screen = ActivityScenario.launch(MainActivity.class)) {
            screen.onActivity(activity -> activity.setNativeAppearance(Color.parseColor("#141521"), true));
            screen.onActivity(activity -> activity.onConfigurationChanged(new Configuration(activity.getResources().getConfiguration())));
            screen.onActivity(activity -> {
                assertEquals(Color.parseColor("#141521"), ((ColorDrawable) activity.getWindow().getDecorView().getBackground()).getColor());
                if (Build.VERSION.SDK_INT < 35) assertEquals(Color.parseColor("#141521"), activity.getWindow().getStatusBarColor());
                // Edge-to-edge gesture bars on API35+ report transparent; the decor assertion covers their backdrop.
                if (Build.VERSION.SDK_INT < 35) assertEquals(Color.parseColor("#141521"), activity.getWindow().getNavigationBarColor());
                assertFalse(WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView()).isAppearanceLightStatusBars());
                assertFalse(WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView()).isAppearanceLightNavigationBars());
                activity.setNativeAppearance(Color.parseColor("#EFEFF7"), false);
                assertEquals(Color.parseColor("#EFEFF7"), ((ColorDrawable) activity.getWindow().getDecorView().getBackground()).getColor());
                if (Build.VERSION.SDK_INT < 35) assertEquals(Color.parseColor("#EFEFF7"), activity.getWindow().getStatusBarColor());
                if (Build.VERSION.SDK_INT < 35) assertEquals(Color.parseColor(Build.VERSION.SDK_INT < 26 ? "#141521" : "#EFEFF7"), activity.getWindow().getNavigationBarColor());
                assertTrue(WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView()).isAppearanceLightStatusBars());
                assertEquals(Build.VERSION.SDK_INT >= 26, WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView()).isAppearanceLightNavigationBars());
            });
        }
    }
}
