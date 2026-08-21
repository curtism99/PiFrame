# Media Layout

Local development media goes under:

```text
sample-media/
  media/
    photos/
      family/
      travel/
      art/
  playlists/
    slideshow.json
```

Pi cache media goes under:

```text
/srv/pi-picture-kiosk/media/
  media/
    photos/
      family/
      travel/
      art/
  playlists/
    slideshow.json
```

The PiFrame config defines `media/photos` as its default discovery root. Adding
a folder such as `media/photos/travel` under the NAS media tree is enough for
PiFrame to discover it after sync and manifest refresh.

Synced playlist files are optional extra image roots, not the normal place to
choose the active album. For example:

```json
{
  "slideshow": [
    "media/photos/family",
    "media/photos/travel"
  ]
}
```

Discovered directories become slideshow groups. Each immediate child folder
under `media/photos` becomes a separate album. The admin page exposes these
groups as the runtime slideshow selector. Choosing `All` uses every discovered
photo; choosing a group limits display to that directory until the selection is
changed or runtime state is reset. The active selection is stored on the Pi,
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

## Legacy Video and Ambience Config

Video and movie playback are no longer part of the primary PiFrame experience.
The scanner ignores video extensions and legacy ambience roots, so
`media/videos` is not required and video files cannot enter slideshow playback.

Old configs remain safe:

- `display.mode` values of `ambience` or `auto` resolve to `slideshow`.
- old runtime mode values resolve to `slideshow`.
- `allowed_video_extensions`, ambience roots, ambience playlists, and ambience
  settings are ignored and reported as warnings.
- old manifests that contain video items are filtered by the slideshow client.

The historical `scripts/optimize-ambience-videos.js` utility remains in the
repository for reference, but its outputs are not indexed by the primary
manifest and it is not exposed as a normal npm workflow.

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
