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

Playlist entries are folder roots and are scanned recursively. This means a
slideshow playlist can include one broad folder:

```json
{
  "slideshow": [
    "media/photos"
  ]
}
```

or a curated set of subfolders:

```json
{
  "slideshow": [
    "media/photos/family",
    "media/photos/travel",
    "media/videos/short-clips"
  ]
}
```

Ambience playlist entries also become playback groups. If the ambience playlist
contains the broad `media/videos` folder, each immediate child folder becomes a
separate ambience group, such as `abstract`, `clouds`, or `underwater`.

```json
{
  "ambience": [
    "media/videos"
  ]
}
```

You can also list curated ambience folders directly:

```json
{
  "ambience": [
    "media/videos/abstract",
    "media/videos/underwater"
  ]
}
```

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
