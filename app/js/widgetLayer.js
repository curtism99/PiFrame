const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "bottom"];

export class WidgetLayer {
  constructor(element) {
    this.element = element;
    this.zones = new Map();
    this.widgets = new Map();
    this.createZones();
    this.resizeObserver = new ResizeObserver(() => this.layoutBottomCorners());
    for (const position of ["bottom-left", "bottom-right"]) this.resizeObserver.observe(this.zones.get(position));
    this.resizeObserver.observe(this.element);
  }

  getWidgetElement(id, position = "bottom-right") {
    const zone = this.zones.get(normalizePosition(position));
    let widget = this.widgets.get(id);

    if (!widget) {
      widget = document.createElement("aside");
      widget.dataset.widget = id;
      widget.className = "widget-card";
      this.widgets.set(id, widget);
    }

    if (widget.parentElement !== zone) {
      zone.append(widget);
    }

    return widget;
  }

  createZones() {
    for (const position of POSITIONS) {
      const zone = document.createElement("div");
      zone.className = `widget-zone ${position}`;
      zone.dataset.position = position;
      this.element.append(zone);
      this.zones.set(position, zone);
    }
  }

  layoutBottomCorners() {
    const left = this.zones.get("bottom-left").getBoundingClientRect();
    const right = this.zones.get("bottom-right").getBoundingClientRect();
    const stacked = left.width > 0 && right.width > 0 && left.right + 12 > right.left;
    this.element.style.setProperty("--bottom-corner-stack", stacked ? `${left.height + 12}px` : "0px");
  }
}

function normalizePosition(position) {
  return POSITIONS.includes(position) ? position : "bottom-right";
}
