export async function fetchWeatherWidget(options = {}) {
  const url = options.refresh ? "/api/widgets/weather?refresh=true" : "/api/widgets/weather";
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Weather widget failed with ${response.status}`);
  }
  return response.json();
}
