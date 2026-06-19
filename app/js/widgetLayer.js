const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];

export class WidgetLayer {
  constructor(element) {
    this.element = element;
    this.zones = new Map();
    this.widgets = new Map();
    this.createZones();
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
}

function normalizePosition(position) {
  return POSITIONS.includes(position) ? position : "bottom-right";
}
