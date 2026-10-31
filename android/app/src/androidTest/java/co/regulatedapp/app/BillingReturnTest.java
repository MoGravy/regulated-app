package co.regulatedapp.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

public class BillingReturnTest {
    @CapacitorPlugin(name = "ReturnProbe")
    public static class ReturnProbe extends Plugin {
        final CountDownLatch delivered = new CountDownLatch(1);
        String url;
        @Override protected void handleOnNewIntent(Intent intent) {
            url = intent.getDataString();
            delivered.countDown();
        }
    }

    @Test public void installedActivityUsesSingleTop() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ActivityInfo info = context.getPackageManager().getActivityInfo(new ComponentName(context, MainActivity.class), 0);
        assertEquals(ActivityInfo.LAUNCH_SINGLE_TOP, info.launchMode);
    }

    @Test public void backgroundReturnReusesActivityAndForwardsIntent() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String url = "co.regulatedapp.app://auth?fixture=return";
        ReturnProbe probe = new ReturnProbe();
        AtomicReference<MainActivity> original = new AtomicReference<>();
        ActivityLifecycleCallback observer = (activity, stage) -> {
            if (activity instanceof MainActivity && stage == Stage.CREATED) {
                ((MainActivity) activity).getBridge().registerPluginInstance(probe);
            }
        };
        ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(observer);
        try (ActivityScenario<MainActivity> screen = ActivityScenario.launch(MainActivity.class)) {
            screen.onActivity(activity -> {
                original.set(activity);
                assertTrue(activity.moveTaskToBack(true));
            });
            context.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url), context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            assertTrue("Return intent did not reach Capacitor plugins", probe.delivered.await(5, TimeUnit.SECONDS));
            assertEquals(url, probe.url);
            screen.onActivity(activity -> assertSame(original.get(), activity));
        } finally {
            ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(observer);
        }
    }
}
