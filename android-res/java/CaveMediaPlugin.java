package com.billscave.player;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** Capacitor route to the same native player, used if window.CaveNative is not injected. */
@CapacitorPlugin(name = "CaveMedia")
public class CaveMediaPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        JSObject data = call.getData();
        CaveMediaBridge.apply(getContext(), (JSONObject) data);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        CaveMediaBridge.stop(getContext());
        call.resolve();
    }
}
