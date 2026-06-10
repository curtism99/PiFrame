import { Router } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";

export function syncRouter({ config, projectRoot }) {
  const router = Router();

  router.post("/", async (request, response) => {
    if (os.platform() === "win32") {
      response.status(501).json({
        ok: false,
        message: "Manual sync is only available on the Raspberry Pi/Linux target."
      });
      return;
    }

    if (typeof process.getuid === "function" && process.getuid() !== 0) {
      response.status(501).json({
        ok: false,
        message: "Manual sync requires root privileges. Use the systemd timer or run the sync service manually on the Pi."
      });
      return;
    }

    const script = config.nas_sync?.script_path
      ? config.nas_sync.script_path
      : path.join(projectRoot, "scripts", "sync-from-nas.sh");

    const child = spawn("/bin/bash", [script], {
      env: {
        ...process.env,
        PIFRAME_NAS_SOURCE: config.nas_sync?.source ?? "",
        PIFRAME_NAS_MOUNT_POINT: config.nas_sync?.mount_point ?? "",
        PIFRAME_LOCAL_CACHE: config.nas_sync?.local_cache ?? config.media.root,
        PIFRAME_CREDENTIALS_FILE: config.nas_sync?.credentials_file ?? "",
        PIFRAME_STATE_FILE: config.runtime_state?.path ?? ""
      }
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      response.status(code === 0 ? 200 : 500).json({ ok: code === 0, exit_code: code, output: output.slice(-5000) });
    });
  });

  return router;
}
