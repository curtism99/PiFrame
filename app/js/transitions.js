export function setTransitionSeconds(seconds) {
  document.documentElement.style.setProperty("--transition-seconds", `${Number(seconds) || 2}s`);
}

export function showLayer(stage, nextLayer, transition = "fade") {
  const oldLayers = [...stage.querySelectorAll(".layer")];
  nextLayer.classList.add(`transition-${transition}`);
  oldLayers.forEach((layer) => {
    layer.classList.add(`transition-${transition}`, "is-exiting");
    layer.classList.remove("is-visible");
  });

  stage.append(nextLayer);
  nextLayer.getBoundingClientRect();
  requestAnimationFrame(() => {
    nextLayer.classList.add("is-visible");
  });

  const delay = getTransitionMs() + 250;
  window.setTimeout(() => {
    oldLayers.forEach((layer) => layer.remove());
  }, delay);
}

function getTransitionMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--transition-seconds");
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : 2000;
}
