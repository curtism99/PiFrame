import { MediaPicker } from "./mediaPicker.js";
import { showLayer } from "./transitions.js";

export class SlideshowMode {
  constructor(stage, emptyState, config, manifest) {
    this.stage = stage;
    this.emptyState = emptyState;
    this.config = config;
    this.photos = manifest.slideshow?.photos ?? [];
    this.picker = new MediaPicker(this.photos, config.slideshow?.shuffle !== false);
    this.timer = null;
  }

  start() {
    this.stop();
    if (this.photos.length === 0) {
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
}
