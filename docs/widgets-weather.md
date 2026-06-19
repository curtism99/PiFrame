# Widgets And NWS Weather

PiFrame widgets are lightweight overlays rendered above slideshow and ambience
media. They are optional and should never block media playback.

V1 widgets:

```text
clock/date
NWS weather
```

The weather widget displays:

```text
current temperature
hourly forecast
7-day high/low forecast
active NWS alerts with event name and time window
```

## Configuration

Set weather location by latitude and longitude, not street address:

```yaml
frame_weather_enabled: true
frame_weather_latitude: 40.6892
frame_weather_longitude: -74.0445
frame_weather_units: "fahrenheit"
frame_weather_test_alerts_enabled: false
```

These Ansible vars render into `/etc/pi-picture-kiosk/config.json`.

## Alert Display

Active alerts show the NWS event name and timing window, for example:

```text
Tornado Warning
6:42 PM - 7:15 PM
```

The display prioritizes tornado warnings, severe thunderstorm warnings, and
tornado watches above lower-priority advisories.

## Test Alerts

The admin page has a `Test weather alerts` toggle. It stores runtime state in:

```text
/var/lib/pi-picture-kiosk/state.json
```

When enabled, the widget displays clearly labeled test alerts:

```text
Severe Thunderstorm Warning
Tornado Watch
Tornado Warning
```

Test alerts are generated with current relative times and are marked `TEST` so
they are not confused with real NWS warnings.

## Offline Behavior

NWS weather requires internet access. If NWS is unavailable, PiFrame keeps using
the last good cached weather payload and marks it stale. Slideshow and ambience
modes continue normally.
