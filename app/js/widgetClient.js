export async function fetchWeatherWidget(options = {}) {
  const url = options.refresh ? "/api/widgets/weather?refresh=true" : "/api/widgets/weather";
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Weather widget failed with ${response.status}`);
  }
  return response.json();
}

export async function fetchTrafficWidget(options = {}) {
  const response = await fetch("/api/widgets/krc-acc-traffic", { cache: "no-store", signal: options.signal });
  if (!response.ok) throw new Error("Frame traffic feed unavailable");
  return response.json();
}
