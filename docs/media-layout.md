# Media Layout

Local development media goes under:

```text
sample-media/
  media/
    photos/
      family/
      travel/
      art/
    videos/
      fireplace/
      clouds/
      abstract/
      short-clips/
  playlists/
    slideshow.json
    ambience.json
```

Pi cache media goes under:

```text
/srv/pi-picture-kiosk/media/
  media/
    photos/
      family/
      travel/
      art/
    videos/
      fireplace/
      clouds/
      abstract/
      short-clips/
  playlists/
    slideshow.json
    ambience.json
```

The PiFrame config defines the default discovery roots, usually `media/photos`
for slideshow and `media/videos` for ambience. Those roots are always scanned.
Adding a new folder such as `media/videos/underwater` under the NAS media tree is
enough for PiFrame to discover it after sync and manifest refresh.

Synced playlist files are optional extra roots for unusual or cross-mode media,
not the normal place to choose the active playlist. For example, a slideshow
playlist file can add a video folder to slideshow rotation:

```json
{
  "slideshow": [
    "media/videos/short-clips"
  ]
}
```

or add a few specific folders outside the default discovery roots:

```json
{
  "slideshow": [
    "media/photos/family",
    "media/photos/travel",
    "media/videos/short-clips"
  ]
}
```

Discovered directories become playback groups. Since `media/photos` and
`media/videos` are default discovery roots, each immediate child folder becomes
a separate group, such as photo albums for slideshow or ambience folders like
`abstract`, `clouds`, or `underwater`.

```json
{
  "ambience": [
    "media/videos"
  ]
}
```

You can also list ambience folders directly. They are added to the default
`media/videos` scan rather than replacing it:

```json
{
  "ambience": [
    "media/videos/abstract",
    "media/videos/underwater"
  ]
}
```

The admin page exposes these discovered groups as runtime playlist selectors for
slideshow and ambience mode. Choosing `All` keeps the old flattened behavior;
choosing a specific group limits that mode to the selected directory until it is
changed again or the runtime state is reset. This selection is stored on the Pi,
not in NAS playlist JSON.

The local cache root contains both `media/` and `playlists/`. The Express static
route serves the `media/` subfolder at `/media`, so a cached file at
`media/photos/family/example.jpg` is displayed from:

```text
/media/photos/family/example.jpg
```

Supported image extensions:

```text
.jpg .jpeg .png .webp
```

Supported video extensions:

```text
.mp4 .webm .mkv
```

For ambience videos on the Pi kiosk display, prefer optimized MP4 files:

```text
H.264 video, yuv420p, max 1920x1080, max 30fps, modest bitrate
```

The optimizer script can audit a video folder or generate a parallel optimized
tree while preserving folders such as `abstract` and `underwater`:

```bash
node scripts/optimize-ambience-videos.js --source /path/to/office/media/videos
node scripts/optimize-ambience-videos.js --source /path/to/office/media/videos --dest /path/to/office-optimized/media/videos --apply
```

Portrait photos on a landscape display use smart-frame mode: a blurred
full-screen background copy with a sharp centered foreground image.

Slideshow transitions affect only the change from one slide to the next. Photos
stay still while displayed.

```json
{
  "transition_effects": {
    "enabled": true,
    "style": "random"
  }
}
```

The admin page can toggle transition effects at runtime and switch between
`random`, `fade`, `dissolve`, and `dip`. Runtime changes are stored separately
from the main config.
