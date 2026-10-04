"""Run with Python 3, Jinja2, Bash and rsync on Linux or WSL.

Fixtures use real rsync against temporary directories. NAS mount detection,
reported disk availability and the existing Node timestamp hook are substituted;
no NAS or Pi is contacted. State-hook invocation is checked without retesting JS.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from jinja2 import Environment, StrictUndefined


ROOT = Path(__file__).resolve().parents[1]
ROLE = ROOT / "ansible/roles/pi_picture_kiosk"
GIB = 1073741824
JINJA = Environment(undefined=StrictUndefined, keep_trailing_newline=True)


class SyncFixture:
    def __init__(self, variant):
        self.temp = tempfile.TemporaryDirectory(prefix="piframe sync fixture ")
        self.root = Path(self.temp.name)
        self.nas = self.root / "nas"
        self.source = self.nas / "office/media/photos"
        self.cache = self.root / "cache"
        self.photos = self.cache / "media/photos"
        self.bin = self.root / "bin"
        self.log = self.root / "sync.log"
        self.state = self.root / "state.json"
        self.state_hook = self.root / "state-hook-called"
        for folder in (self.source, self.photos, self.bin):
            folder.mkdir(parents=True)
        self.state.write_text('{"fixture_setting": "preserved"}')
        self.write_command("mountpoint", '[[ "${2:-}" == "$PIFRAME_NAS_MOUNT_POINT" ]]\n')
        self.write_command("df", 'printf "Filesystem 1B-blocks Used Available Use%% Mounted_on\\nfixture 9999999999 0 %s 0%% /fixture\\n" "$PIFRAME_TEST_FREE_BYTES"\n')
        self.write_command("node", ': > "$PIFRAME_TEST_STATE_HOOK"\n')
        self.env = dict(os.environ)
        self.env.update({
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "PIFRAME_NAS_SOURCE": "//127.0.0.1/fixture",
            "PIFRAME_NAS_SOURCE_SUBDIR": "office",
            "PIFRAME_NAS_MOUNT_POINT": str(self.nas),
            "PIFRAME_LOCAL_CACHE": str(self.cache),
            "PIFRAME_CREDENTIALS_FILE": str(self.root / "unused-credentials"),
            "PIFRAME_STATE_FILE": str(self.state),
            "PIFRAME_SYNC_LOG": str(self.log),
            "PIFRAME_TEST_FREE_BYTES": str(2 * GIB),
            "PIFRAME_TEST_STATE_HOOK": str(self.state_hook),
        })
        for variable in ("PIFRAME_NAS_PHOTO_SUBDIR", "PIFRAME_MIN_FREE_BYTES"):
            self.env.pop(variable, None)
        self.variables = {
            "frame_nas_source": "//127.0.0.1/fixture",
            "frame_nas_source_subdir": "office",
            "frame_nas_mount_point": str(self.nas),
            "frame_media_root": str(self.cache),
            "frame_nas_credentials_file": str(self.root / "unused-credentials"),
            "frame_state_dir": str(self.root),
            "frame_kiosk_user": "root",
            "frame_app_dir": "/opt/pi-picture-kiosk",
        }
        self.script = ROOT / "scripts/sync-from-nas.sh"
        if variant == "ansible":
            self.script = self.root / "rendered-sync.sh"
            source = (ROLE / "templates/sync-from-nas.sh.j2").read_text()
            self.script.write_text(JINJA.from_string(source).render(**self.variables))

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.temp.cleanup()

    def write_command(self, name, body):
        target = self.bin / name
        target.write_text("#!/usr/bin/env bash\n" + body)
        target.chmod(0o755)

    def put(self, directory, relative, content=b"fixture image data"):
        target = directory / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return target

    def run(self):
        return subprocess.run(["bash", str(self.script)], env=self.env,
                              capture_output=True, text=True, timeout=30)


class MediaSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for command in ("bash", "rsync"):
            if shutil.which(command) is None:
                raise RuntimeError(f"{command} is required; run these fixtures on Linux or WSL")

    def test_photo_only_copy_is_recursive_case_insensitive_and_scoped(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                expected = ("family/private photo.JPG", "family/photo.JpEg", "art/photo.png", "photo.WEBP")
                for name in expected:
                    f.put(f.source, name)
                f.put(f.source, "family/movie.mp4")
                f.put(f.source, "family/movie.WEBM")
                f.put(f.source, "notes.txt")
                f.put(f.nas, "office/media/videos/outside.mp4")
                f.put(f.photos, "stale.jpg")
                f.put(f.photos, "old.mp4")
                sibling = f.put(f.cache, "media/videos/preexisting.mp4", b"leave explicit cleanup separate")
                playlist = f.put(f.cache, "playlists/slideshow.json", b"{}")
                result = f.run()
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                actual = {str(path.relative_to(f.photos)) for path in f.photos.rglob("*") if path.is_file()}
                self.assertEqual(actual, set(expected))
                self.assertEqual(sibling.read_bytes(), b"leave explicit cleanup separate")
                self.assertEqual(playlist.read_bytes(), b"{}")
                self.assertNotIn("private photo.JPG", result.stdout + result.stderr)
                state = json.loads(f.state.read_text())
                self.assertEqual(state["fixture_setting"], "preserved")
                self.assertTrue(f.state_hook.exists())

    def test_sync_does_not_create_video_cache(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                f.put(f.source, "photo.jpg")
                f.put(f.nas, "office/media/videos/movie.mp4")
                self.assertEqual(f.run().returncode, 0)
                self.assertFalse((f.cache / "media/videos").exists())

    def test_empty_source_preserves_existing_cache_and_state(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                keep = f.put(f.photos, "keep.jpg")
                f.put(f.source, "not-a-photo.mp4")
                before = f.state.read_bytes()
                self.assertEqual(f.run().returncode, 29)
                self.assertEqual(keep.read_bytes(), b"fixture image data")
                self.assertEqual(f.state.read_bytes(), before)
                self.assertFalse(f.state_hook.exists())

    def test_missing_source_preserves_existing_cache(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                keep = f.put(f.photos, "keep.jpg")
                f.source.rmdir()
                self.assertEqual(f.run().returncode, 22)
                self.assertTrue(keep.exists())

    def test_headroom_accounts_for_incoming_copy_before_old_files_are_deleted(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                f.put(f.source, "new.jpg", b"new image")
                keep = f.put(f.photos, "old.jpg", b"old image" * 100)
                f.env["PIFRAME_TEST_FREE_BYTES"] = str(GIB)
                self.assertEqual(f.run().returncode, 28)
                self.assertTrue(keep.exists())
                self.assertFalse((f.photos / "new.jpg").exists())

    def test_reserve_override_cannot_remove_one_gib_floor(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                f.put(f.source, "new.jpg")
                f.env["PIFRAME_MIN_FREE_BYTES"] = "0"
                f.env["PIFRAME_TEST_FREE_BYTES"] = str(GIB - 1)
                self.assertEqual(f.run().returncode, 28)
                self.assertFalse((f.photos / "new.jpg").exists())

    def test_invalid_photo_root_is_rejected_before_sync(self):
        for variant in ("standalone", "ansible"):
            for root in ("../videos", "/media/photos", ""):
                with self.subTest(variant=variant, root=root), SyncFixture(variant) as f:
                    f.env["PIFRAME_NAS_PHOTO_SUBDIR"] = root
                    keep = f.put(f.photos, "keep.jpg")
                    self.assertEqual(f.run().returncode, 24)
                    self.assertTrue(keep.exists())

    def test_empty_office_subdir_override_uses_share_root(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                f.put(f.nas, "media/photos/share-root.jpg")
                f.env["PIFRAME_NAS_SOURCE_SUBDIR"] = ""
                self.assertEqual(f.run().returncode, 0)
                self.assertTrue((f.photos / "share-root.jpg").exists())

    def test_io_failure_is_propagated_without_exposing_file_names_or_marking_success(self):
        for variant in ("standalone", "ansible"):
            with self.subTest(variant=variant), SyncFixture(variant) as f:
                f.put(f.source, "photo.jpg")
                before = f.state.read_bytes()
                f.write_command("rsync", "printf '%s\\n' 'private-fixture-name.jpg: file IO error' >&2\nexit 11\n")
                result = f.run()
                self.assertEqual(result.returncode, 11)
                self.assertNotIn("private-fixture-name.jpg", result.stdout + result.stderr)
                self.assertIn("private-fixture-name.jpg", f.log.read_text())
                self.assertEqual(f.state.read_bytes(), before)
                self.assertFalse(f.state_hook.exists())

    def test_service_template_passes_photo_source_and_reserve_defaults(self):
        with SyncFixture("standalone") as f:
            source = (ROLE / "templates/piframe-media-sync.service.j2").read_text()
            rendered = JINJA.from_string(source).render(**f.variables)
            self.assertIn("Environment=PIFRAME_NAS_PHOTO_SUBDIR=media/photos", rendered)
            self.assertIn(f"Environment=PIFRAME_MIN_FREE_BYTES={GIB}", rendered)
            custom = JINJA.from_string(source).render(**f.variables, frame_nas_photo_subdir="albums", frame_sync_min_free_bytes=2 * GIB)
            self.assertIn("Environment=PIFRAME_NAS_PHOTO_SUBDIR=albums", custom)
            self.assertIn(f"Environment=PIFRAME_MIN_FREE_BYTES={2 * GIB}", custom)


if __name__ == "__main__":
    unittest.main()
