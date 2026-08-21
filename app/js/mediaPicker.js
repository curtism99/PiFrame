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
