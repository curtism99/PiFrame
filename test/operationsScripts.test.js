import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

function rsyncBlock(source) {
  const start = source.indexOf("\nrsync \\\n");
  const end = source.indexOf("rsync_status=", start);

  assert.notEqual(start, -1, "sync script should contain an rsync command");
  assert.notEqual(end, -1, "sync script should capture the rsync status");
  return source.slice(start, end);
}

test("standalone and Ansible sync scripts enforce the photo-only cache boundary", async () => {
  const [standalone, template] = await Promise.all([
    readProjectFile("scripts/sync-from-nas.sh"),
    readProjectFile("ansible/roles/pi_picture_kiosk/templates/sync-from-nas.sh.j2")
  ]);

  for (const source of [standalone, template]) {
    assert.match(source, /PHOTO_SOURCE="\$SYNC_SOURCE\/\$NAS_PHOTO_SUBDIR"/);
    assert.match(source, /PHOTO_CACHE="\$LOCAL_CACHE\/media\/photos"/);
    assert.match(source, /--include='\*\.\[jJ\]\[pP\]\[gG\]'/);
    assert.match(source, /--include='\*\.\[jJ\]\[pP\]\[eE\]\[gG\]'/);
    assert.match(source, /--include='\*\.\[pP\]\[nN\]\[gG\]'/);
    assert.match(source, /--include='\*\.\[wW\]\[eE\]\[bB\]\[pP\]'/);
    assert.match(source, /--exclude='\*'/);
    assert.match(source, /--delete-excluded/);
    assert.match(source, /SOURCE_BYTES \+ MIN_FREE_BYTES > AVAILABLE_BYTES \+ CACHE_BYTES/);
    assert.doesNotMatch(source, /"\$SYNC_SOURCE"\/ "\$LOCAL_CACHE"\//);
    assert.doesNotMatch(source, /-rltv/);
  }

  assert.equal(rsyncBlock(standalone), rsyncBlock(template));
});

test("browser restart creates its log directory without duplicating launcher logs", async () => {
  const script = await readProjectFile("scripts/kiosk-control.sh");
  const createDirectory = script.indexOf('mkdir -p "$(dirname "${LOG_FILE}")"');
  const launch = script.indexOf('nohup "${LAUNCHER}" >/dev/null 2>&1 &');

  assert.notEqual(createDirectory, -1);
  assert.notEqual(launch, -1);
  assert.ok(createDirectory < launch, "log directory must exist before the background launch");
  assert.doesNotMatch(script, /nohup "\$\{LAUNCHER\}" >>"\$\{LOG_FILE\}"/);
});

test("Ansible provisions the current Chromium package and sync safeguards", async () => {
  const [packages, kioskTasks, systemdTasks, syncService] = await Promise.all([
    readProjectFile("ansible/roles/pi_picture_kiosk/tasks/packages.yml"),
    readProjectFile("ansible/roles/pi_picture_kiosk/tasks/kiosk.yml"),
    readProjectFile("ansible/roles/pi_picture_kiosk/tasks/systemd.yml"),
    readProjectFile("ansible/roles/pi_picture_kiosk/templates/piframe-media-sync.service.j2")
  ]);

  assert.match(packages, /^\s+- chromium$/m);
  assert.doesNotMatch(packages, /^\s+- chromium-browser$/m);
  assert.match(kioskTasks, /\.local\/state\/pi-picture-kiosk/);
  assert.match(systemdTasks, /frame_sync_timer_enabled/);
  assert.match(syncService, /PIFRAME_NAS_PHOTO_SUBDIR=/);
  assert.match(syncService, /PIFRAME_MIN_FREE_BYTES=/);
});
