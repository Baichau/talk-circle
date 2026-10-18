import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const online = Boolean(url && key);
const sb = online ? createClient(url, key) : null;

export function createRoom(code, me, onPeers, onStatus) {
  if (!sb) throw new Error("Live rooms are not configured. Add the Supabase URL and anon key.");
  const ch = sb.channel("talk-circle:" + code, { config: { presence: { key: me.id } } });
  let active = true;
  let claimed = false;
  let checking = false;
  const leave = () => {
    if (!active) return;
    active = false;
    return sb.removeChannel(ch);
  };
  const claim = async () => {
    if (!active || claimed || checking) return;
    checking = true;
    const peers = Object.values(ch.presenceState()).flatMap((entries) => entries);
    if (peers.length) {
      onStatus("error", "That room code is already in use. Try a different code.");
      await leave();
      return;
    }
    try {
      const status = await ch.track(me);
      if (!active) return;
      if (status !== "ok") {
        onStatus("error", "Could not reserve that room code (" + status + "). Please try again.");
        await leave();
        return;
      }
      claimed = true;
      onPeers([me]);
      onStatus("connected");
    } catch (error) {
      if (!active) return;
      onStatus("error", error instanceof Error ? error.message : "Could not create the room.");
      await leave();
    }
  };
  ch.on("presence", { event: "sync" }, () => {
    if (!active) return;
    const peers = Object.values(ch.presenceState()).flatMap((entries) => entries);
    if (!claimed) {
      void claim();
      return;
    }
    onPeers(peers);
  });
  ch.subscribe((status, error) => {
    if (!active) return;
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      onStatus("error", error?.message || "Could not connect to the room. Check your connection and try again.");
    } else if (status === "CLOSED") {
      onStatus("disconnected");
    }
  });
  return {
    track: async (presence) => {
      try {
        const status = await ch.track(presence);
        if (active && status !== "ok") onStatus("error", "Room sync failed (" + status + "). Check your connection and try again.");
      } catch (error) {
        if (active) onStatus("error", error instanceof Error ? error.message : "Could not sync the room.");
      }
    },
    leave,
  };
}

// Each phone publishes {id,name,j,g} as presence. g is the shared game state.
export function joinRoom(code, me, onPeers, onStatus) {
  if (!sb) throw new Error("Live rooms are not configured. Add the Supabase URL and anon key.");
  const ch = sb.channel("talk-circle:" + code, { config: { presence: { key: me.id } } });
  let active = true;
  let waitTimer;
  let sawPeer = false;
  const leave = () => {
    if (!active) return;
    active = false;
    window.clearTimeout(waitTimer);
    return sb.removeChannel(ch);
  };
  const reportTrack = async (presence) => {
    try {
      const status = await ch.track(presence);
      if (active && status !== "ok") onStatus("error", "Room sync failed (" + status + "). Check your connection and try again.");
    } catch (error) {
      if (active) onStatus("error", error instanceof Error ? error.message : "Could not sync the room.");
    }
  };
  ch.on("presence", { event: "sync" }, () => {
    if (!active) return;
    const peers = Object.values(ch.presenceState()).map((entries) => entries[entries.length - 1]);
    onPeers(peers);
    if (me.creator || peers.some((peer) => peer.id !== me.id)) {
      sawPeer = true;
      window.clearTimeout(waitTimer);
      onStatus("connected");
    } else {
      onStatus("waiting");
      if (!sawPeer && !waitTimer) {
        waitTimer = window.setTimeout(() => {
          if (!active || sawPeer) return;
          onStatus("error", "No active room found with that code. Check the code or ask the host to create the room.");
          void leave();
        }, 5000);
      }
    }
  });
  ch.subscribe((status, error) => {
    if (!active) return;
    if (status === "SUBSCRIBED") {
      void reportTrack(me);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      onStatus("error", error?.message || "Could not connect to the room. Check your connection and try again.");
    } else if (status === "CLOSED") {
      onStatus("disconnected");
    }
  });
  return {
    track: (presence) => { void reportTrack(presence); },
    leave,
  };
}
