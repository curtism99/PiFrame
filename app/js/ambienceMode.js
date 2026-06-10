import { MediaPicker } from "./mediaPicker.js";
import { showLayer } from "./transitions.js";

export class AmbienceMode {
  constructor(stage, emptyState, config, manifest) {
    this.stage = stage;
    this.emptyState = emptyState;
    this.config = config;
    this.videos = manifest.ambience?.videos ?? [];
    this.picker = new MediaPicker(this.videos, config.ambience?.shuffle !== false);
    this.timer = null;
  }

  start() {
    this.stop();
    if (this.videos.length === 0) {
      this.stage.replaceChildren();
      this.emptyState.hidden = false;
      return;
    }

    this.emptyState.hidden = true;
    this.showNext();
  }

  stop() {
    window.clearTimeout(this.timer);
    this.timer = null;
    this.stage.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
  }

  showNext() {
    const item = this.picker.next();
    if (!item) {
      return;
    }

    const layer = document.createElement("div");
    layer.className = "layer";

    const video = document.createElement("video");
    video.className = "ambience-video";
    video.src = item.url;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.muted = this.config.ambience?.muted !== false;
    video.preload = "auto";

    video.addEventListener("error", () => this.showNext(), { once: true });
    layer.append(video);
    showLayer(this.stage, layer);
    video.play().catch(() => {});

    const minutes = Number(this.config.ambience?.video_duration_minutes) || 30;
    this.timer = window.setTimeout(() => this.showNext(), minutes * 60 * 1000);
  }
}
