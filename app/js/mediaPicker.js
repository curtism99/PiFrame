export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export class MediaPicker {
  constructor(items, shouldShuffle = true) {
    this.original = [...items];
    this.shouldShuffle = shouldShuffle;
    this.queue = [];
  }

  next() {
    if (this.original.length === 0) {
      return null;
    }

    if (this.queue.length === 0) {
      this.queue = this.shouldShuffle ? shuffle(this.original) : [...this.original];
    }

    return this.queue.shift();
  }
}

export function weightedMode(weights = {}) {
  const entries = Object.entries(weights)
    .filter(([, weight]) => Number(weight) > 0)
    .map(([mode, weight]) => [mode, Number(weight)]);

  if (entries.length === 0) {
    return Math.random() < 0.5 ? "slideshow" : "ambience";
  }

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.random() * total;

  for (const [mode, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) {
      return mode;
    }
  }

  return entries[0][0];
}
