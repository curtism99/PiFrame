import { MediaPicker } from "./mediaPicker.js";
import { showLayer } from "./transitions.js";

export class SlideshowMode {
  constructor(stage, emptyState, config, manifest) {
    this.stage = stage;
    this.emptyState = emptyState;
    this.config = config;
    this.items = manifest.slideshow?.items ?? manifest.slideshow?.photos ?? [];
    this.picker = new MediaPicker(this.items, config.slideshow?.shuffle !== false);
    this.timer = null;
  }

  start() {
    this.stop();
    if (this.items.length === 0) {
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
  }

  showNext() {
    const item = this.picker.next();
    if (!item) {
      return;
    }

    if (item.type === "video") {
      this.showVideo(item);
      return;
    }

    this.showPhoto(item);
  }

  showPhoto(item) {
    const layer = document.createElement("div");
    const fit = this.config.slideshow?.image_fit ?? "smart-frame";
    layer.className = `layer fit-${fit}`;

    if (fit === "smart-frame") {
      const background = document.createElement("img");
      background.className = "photo-bg";
      background.src = item.url;
      background.alt = "";

      const foreground = document.createElement("img");
      foreground.className = "photo-fg";
      foreground.src = item.url;
      foreground.alt = "";
      foreground.decoding = "async";

      foreground.addEventListener("error", () => this.showNext(), { once: true });
      layer.append(background, foreground);
    } else {
      const img = document.createElement("img");
      img.className = `single-photo fit-${fit}`;
      img.src = item.url;
      img.alt = "";
      img.decoding = "async";
      img.addEventListener("error", () => this.showNext(), { once: true });
      layer.append(img);
    }

    showLayer(this.stage, layer);

    const seconds = Number(this.config.slideshow?.photo_duration_seconds) || 20;
    this.timer = window.setTimeout(() => this.showNext(), seconds * 1000);
  }

  showVideo(item) {
    const layer = document.createElement("div");
    layer.className = "layer";

    const video = document.createElement("video");
    video.className = "ambience-video";
    video.src = item.url;
    video.autoplay = true;
    video.loop = false;
    video.playsInline = true;
    video.muted = true;
    video.preload = "auto";

    video.addEventListener("ended", () => this.showNext(), { once: true });
    video.addEventListener("error", () => this.showNext(), { once: true });
    layer.append(video);
    showLayer(this.stage, layer);
    video.play().catch(() => {});

    const seconds = Number(this.config.slideshow?.photo_duration_seconds) || 20;
    this.timer = window.setTimeout(() => this.showNext(), seconds * 1000);
  }
}
