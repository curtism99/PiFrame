import { MediaPicker } from "./mediaPicker.js";
import { showLayer } from "./transitions.js";

export class SlideshowMode {
  constructor(stage, emptyState, config, manifest, runtimeOptions = {}) {
    this.stage = stage;
    this.emptyState = emptyState;
    this.config = config;
    this.runtimeOptions = runtimeOptions;
    this.shuffle = config.slideshow?.shuffle !== false;
    this.groups = normalizeSlideshowGroups(manifest.slideshow);
    this.allItems = manifest.slideshow?.items ?? manifest.slideshow?.photos ?? [];
    this.timer = null;
    this.started = false;
    this.configurePlaylist(runtimeOptions?.selected_playlists?.slideshow);
  }

  start() {
    this.stop();
    this.started = true;
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
    this.started = false;
    this.stage.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
  }

  setRuntimeOptions(runtimeOptions = {}) {
    this.runtimeOptions = runtimeOptions;
    const nextPlaylistId = runtimeOptions?.selected_playlists?.slideshow ?? null;
    if (nextPlaylistId === this.selectedPlaylistId) {
      return;
    }

    this.configurePlaylist(nextPlaylistId);
    if (this.started) {
      this.showNext();
    }
  }

  configurePlaylist(selectedPlaylistId) {
    this.selectedPlaylistId = selectedPlaylistId ?? null;
    this.selectedGroup = selectedGroup(this.groups, this.selectedPlaylistId);
    this.items = this.selectedGroup?.items ?? this.allItems;
    this.picker = new MediaPicker(this.items, this.shuffle);
  }

  showNext() {
    window.clearTimeout(this.timer);
    this.timer = null;
    const item = this.picker.next();
    if (!item) {
      this.stage.replaceChildren();
      this.emptyState.hidden = false;
      return;
    }

    this.emptyState.hidden = true;
    if (item.type === "video") {
      this.showVideo(item);
      return;
    }

    this.showPhoto(item);
  }

  async showPhoto(item) {
    const layer = document.createElement("div");
    const fit = this.config.slideshow?.image_fit ?? "smart-frame";
    const transition = this.pickTransition();
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

      layer.append(background, foreground);
      if (!(await waitForImage(foreground))) {
        this.showNext();
        return;
      }
    } else {
      const img = document.createElement("img");
      img.className = `single-photo fit-${fit}`;
      img.src = item.url;
      img.alt = "";
      img.decoding = "async";
      layer.append(img);
      if (!(await waitForImage(img))) {
        this.showNext();
        return;
      }
    }

    showLayer(this.stage, layer, transition);

    this.timer = window.setTimeout(() => this.showNext(), this.slideSeconds() * 1000);
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
    showLayer(this.stage, layer, this.pickTransition());
    video.play().catch(() => {});

    this.timer = window.setTimeout(() => this.showNext(), this.slideSeconds() * 1000);
  }

  slideSeconds() {
    return Number(this.config.slideshow?.photo_duration_seconds) || 20;
  }

  pickTransition() {
    const settings = {
      ...(this.config.slideshow?.transition_effects ?? {}),
      ...(this.runtimeOptions?.slideshow_effects ?? this.runtimeOptions ?? {})
    };

    if (settings.enabled === false) {
      return "fade";
    }

    const style = settings.style ?? "random";
    if (style === "fade" || style === "dissolve" || style === "dip") {
      return style;
    }

    const transitionGroups = {
      random: settings.effects ?? ["fade", "dissolve", "dip"]
    };
    const transitions = transitionGroups[style] ?? transitionGroups.random;
    const transition = transitions[Math.floor(Math.random() * transitions.length)] ?? "fade";
    return ["fade", "dissolve", "dip"].includes(transition) ? transition : "fade";
  }
}

async function waitForImage(image) {
  if (image.complete && image.naturalWidth > 0) {
    return true;
  }

  try {
    if (typeof image.decode === "function") {
      await image.decode();
      return image.naturalWidth > 0;
    }
  } catch {
    return false;
  }

  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(true), { once: true });
    image.addEventListener("error", () => resolve(false), { once: true });
  });
}

function normalizeSlideshowGroups(slideshow = {}) {
  const groups = Array.isArray(slideshow.groups) ? slideshow.groups : [];
  return groups
    .map((group) => ({
      id: group.id ?? group.path ?? group.label,
      label: group.label ?? group.path ?? group.id,
      path: group.path ?? group.id,
      items: Array.isArray(group.items) ? group.items : [],
      photos: Array.isArray(group.photos) ? group.photos : [],
      videos: Array.isArray(group.videos) ? group.videos : []
    }))
    .filter((group) => group.id && group.items.length > 0);
}

function selectedGroup(groups, selectedId) {
  if (!selectedId) {
    return null;
  }

  return groups.find((group) => group.id === selectedId) ?? null;
}
