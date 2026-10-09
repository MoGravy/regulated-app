package co.regulatedapp.app;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAppearance")
public class NativeAppearancePlugin extends Plugin {
    @PluginMethod public void setAppearance(PluginCall call) {
        String color = call.getString("color", "");
        if (!color.matches("#[0-9a-fA-F]{6}")) {
            call.reject("Invalid appearance color");
            return;
        }
        boolean dark = call.getBoolean("dark", false);
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).setNativeAppearance(Color.parseColor(color), dark);
            call.resolve();
        });
    }
}
