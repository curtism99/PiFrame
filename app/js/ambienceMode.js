import { MediaPicker } from "./mediaPicker.js";
import { showLayer } from "./transitions.js";

const VIDEO_LOAD_TIMEOUT_MS = 10000;
const HAVE_CURRENT_DATA = 2;

export class AmbienceMode {
  constructor(stage, emptyState, config, manifest, runtimeOptions = {}) {
    this.stage = stage;
    this.emptyState = emptyState;
    this.config = config;
    this.shuffle = config.ambience?.shuffle !== false;
    this.groups = normalizeAmbienceGroups(manifest.ambience);
    this.allVideos = manifest.ambience?.videos ?? [];
    this.timer = null;
    this.started = false;
    this.playbackToken = 0;
    this.configurePlaylist(runtimeOptions?.selected_playlists?.ambience);
  }

  start() {
    this.stop();
    this.started = true;
    if (this.videos.length === 0) {
      this.stage.replaceChildren();
      this.emptyState.hidden = false;
      return;
    }

    this.emptyState.hidden = true;
    this.showNext();
  }

  stop() {
    this.started = false;
    this.stopCurrentPlayback();
  }

  setRuntimeOptions(runtimeOptions = {}) {
    const nextPlaylistId = runtimeOptions?.selected_playlists?.ambience ?? null;
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
    this.videos = this.selectedGroup?.videos ?? this.allVideos;
    this.groupPicker = new MediaPicker(this.selectedGroup ? [this.selectedGroup] : this.groups, this.shuffle);
    this.groupVideoPickers = new Map();
    this.picker = new MediaPicker(this.videos, this.shuffle);
  }

  stopCurrentPlayback() {
    this.playbackToken += 1;
    window.clearTimeout(this.timer);
    this.timer = null;
    this.stage.querySelectorAll("video").forEach((video) => {
      cleanupVideo(video);
    });
  }

  async showNext() {
    if (!this.started) {
      return;
    }

    const token = ++this.playbackToken;
    window.clearTimeout(this.timer);
    this.timer = null;

    const attempts = Math.max(this.videos.length, this.groups.length, 1);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const item = this.nextItem();
      if (!item) {
        break;
      }

      const prepared = await this.prepareVideoLayer(item, token);
      if (!prepared) {
        continue;
      }

      if (!this.started || token !== this.playbackToken) {
        cleanupVideo(prepared.video);
        return;
      }

      this.emptyState.hidden = true;
      const oldVideos = [...this.stage.querySelectorAll("video")];
      showLayer(this.stage, prepared.layer);
      prepared.video.play().catch(() => {
        if (this.started && token === this.playbackToken) {
          this.showNext();
        }
      });

      const cleanupDelay = transitionMs(this.config) + 500;
      window.setTimeout(() => oldVideos.forEach(cleanupVideo), cleanupDelay);

      const minutes = Number(this.config.ambience?.video_duration_minutes) || 30;
      this.timer = window.setTimeout(() => this.showNext(), minutes * 60 * 1000);
      return;
    }

    if (!this.stage.querySelector(".layer")) {
      this.stage.replaceChildren();
      this.emptyState.hidden = false;
    }
  }

  async prepareVideoLayer(item, token) {
    const layer = document.createElement("div");
    layer.className = "layer";

    const video = document.createElement("video");
    video.className = "ambience-video";
    video.src = item.url;
    video.autoplay = true;
    video.loop = false;
    video.playsInline = true;
    video.muted = this.config.ambience?.muted !== false;
    video.preload = "auto";

    layer.append(video);

    if (!(await waitForVideoReady(video, VIDEO_LOAD_TIMEOUT_MS))) {
      cleanupVideo(video);
      return null;
    }

    video.addEventListener("ended", () => {
      if (this.started && token === this.playbackToken) {
        this.showNext();
      }
    }, { once: true });
    video.addEventListener("error", () => {
      if (this.started && token === this.playbackToken) {
        this.showNext();
      }
    }, { once: true });

    return { layer, video };
  }

  nextItem() {
    if (this.selectedGroup) {
      return this.picker.next();
    }

    for (let attempt = 0; attempt < this.groups.length; attempt += 1) {
      const group = this.groupPicker.next();
      if (!group) {
        break;
      }

      const picker = this.videoPickerForGroup(group);
      const item = picker.next();
      if (item) {
        return item;
      }
    }

    return this.picker.next();
  }

  videoPickerForGroup(group) {
    if (!this.groupVideoPickers.has(group.id)) {
      this.groupVideoPickers.set(group.id, new MediaPicker(group.videos, this.shuffle));
    }

    return this.groupVideoPickers.get(group.id);
  }
}

function normalizeAmbienceGroups(ambience = {}) {
  const groups = Array.isArray(ambience.groups) ? ambience.groups : [];
  return groups
    .map((group) => ({
      id: group.id ?? group.path ?? group.label,
      label: group.label ?? group.path ?? group.id,
      path: group.path ?? group.id,
      videos: Array.isArray(group.videos) ? group.videos : []
    }))
    .filter((group) => group.id && group.videos.length > 0);
}

function selectedGroup(groups, selectedId) {
  if (!selectedId) {
    return null;
  }

  return groups.find((group) => group.id === selectedId) ?? null;
}

function waitForVideoReady(video, timeoutMs) {
  if (video.readyState >= HAVE_CURRENT_DATA) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const timer = window.setTimeout(() => finish(false), timeoutMs);

    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.load();
  });
}

function cleanupVideo(video) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

function transitionMs(config) {
  return (Number(config.display?.transition_seconds) || 2) * 1000;
}
