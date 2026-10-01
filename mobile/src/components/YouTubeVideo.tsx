import { useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { API_URL } from "../lib/config";
import type { Media } from "../lib/usePlayback";

/**
 * The official YouTube player in a web view (kept visible, as YouTube's terms
 * require). It reports its time every 250 ms; the clock fills in between.
 */
export function YouTubeVideo({ videoId, onMedia }: { videoId: string; onMedia: (media: Media) => void }) {
  const view = useRef<WebView>(null);
  const state = useRef({ time: 0, at: Date.now(), playing: false, rate: 1, duration: 0, ended: false, sent: false });

  const html = useMemo(
    () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#000;height:100%}#p{width:100%;height:100%}</style></head>
<body><div id="p"></div><script src="https://www.youtube.com/iframe_api"></script><script>
var player;function send(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
function onYouTubeIframeAPIReady(){player=new YT.Player('p',{videoId:${JSON.stringify(videoId)},playerVars:{playsinline:1,rel:0,modestbranding:1},
events:{onReady:function(){send({type:'ready',duration:player.getDuration()})},onStateChange:function(e){send({type:'state',state:e.data,time:player.getCurrentTime()})}}});
setInterval(function(){if(player&&player.getCurrentTime){send({type:'time',time:player.getCurrentTime(),duration:player.getDuration()})}},250)}
window.verso=function(c,a){if(!player)return;if(c==='play')player.playVideo();if(c==='pause')player.pauseVideo();if(c==='seek')player.seekTo(a,true);if(c==='rate')player.setPlaybackRate(a)};
</script></body></html>`,
    [videoId],
  );

  const command = (name: string, arg?: number) => view.current?.injectJavaScript(`window.verso(${JSON.stringify(name)},${arg ?? "null"});true;`);

  function onMessage(event: WebViewMessageEvent) {
    let message: { type?: string; time?: number; duration?: number; state?: number };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    const s = state.current;
    if (typeof message.time === "number") {
      s.time = message.time;
      s.at = Date.now();
    }
    if (typeof message.duration === "number" && message.duration > 0) s.duration = message.duration;
    if (message.type === "state") {
      s.playing = message.state === 1;
      s.ended = message.state === 0;
    }
    if (!s.sent && message.type === "ready") {
      s.sent = true;
      onMedia({
        play: () => {
          s.ended = false;
          command("play");
        },
        pause: () => command("pause"),
        seek: (seconds) => {
          s.time = seconds;
          s.at = Date.now();
          command("seek", seconds);
        },
        setRate: (rate) => {
          s.rate = rate;
          command("rate", rate);
        },
        time: () => (s.playing ? s.time + ((Date.now() - s.at) / 1000) * s.rate : s.time),
        duration: () => s.duration,
        ended: () => s.ended,
      });
    }
  }

  return (
    <View style={styles.frame}>
      <WebView
        ref={view}
        source={{ html, baseUrl: API_URL || "https://verso.app" }}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        style={styles.video}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 16 / 9, width: "100%", borderRadius: 16, overflow: "hidden", backgroundColor: "#000" },
  video: { flex: 1, backgroundColor: "#000" },
});
