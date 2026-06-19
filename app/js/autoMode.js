import { weightedMode } from "./mediaPicker.js";

export class AutoMode {
  constructor(config, switchMode) {
    this.config = config;
    this.switchMode = switchMode;
    this.timer = null;
  }

  start() {
    this.stop();
    this.choose();
    const minutes = Number(this.config.auto_mode?.switch_mode_every_minutes) || 30;
    this.timer = window.setInterval(() => this.choose(), minutes * 60 * 1000);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = null;
  }

  choose() {
    const mode = weightedMode(this.config.auto_mode?.weights);
    this.switchMode(mode);
  }
}
