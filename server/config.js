import fs from "node:fs/promises";
import path from "node:path";

const PROD_CONFIG_PATH = "/etc/pi-picture-kiosk/config.json";

export async function loadConfig(projectRoot) {
  const requestedPath = process.env.PIFRAME_CONFIG_PATH;
  const localPath = path.join(projectRoot, "config", "frame.config.example.json");
  const configPath = requestedPath ?? (await exists(PROD_CONFIG_PATH) ? PROD_CONFIG_PATH : localPath);

  const raw = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(raw);
  normalizePaths(config, projectRoot);

  const runtimeState = createRuntimeState(config, projectRoot);
  await runtimeState.ensure();

  return { config, configPath, runtimeState };
}

function normalizePaths(config, projectRoot) {
  if (config.media?.root) {
    config.media.root = resolveMaybeRelative(config.media.root, projectRoot);
  }

  if (config.runtime_state?.path) {
    config.runtime_state.path = resolveMaybeRelative(config.runtime_state.path, projectRoot);
  } else {
    config.runtime_state = {
      ...(config.runtime_state ?? {}),
      path: path.join(projectRoot, ".runtime", "state.json")
    };
  }
}

function resolveMaybeRelative(value, projectRoot) {
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function createRuntimeState(config, projectRoot) {
  const statePath = process.env.PIFRAME_STATE_PATH
    ? resolveMaybeRelative(process.env.PIFRAME_STATE_PATH, projectRoot)
    : config.runtime_state.path;
  let writeQueue = Promise.resolve();

  const defaults = {
    current_mode: null,
    clock_enabled: Boolean(config.clock?.enabled),
    slideshow_playlist_id: null,
    ambience_playlist_id: null,
    slideshow_effects_enabled: config.slideshow?.transition_effects?.enabled !== false,
    slideshow_effect_style: config.slideshow?.transition_effects?.style ?? "random",
    weather_test_alerts_enabled: Boolean(config.widgets?.weather?.test_alerts?.enabled),
    last_sync: null,
    updated_at: null
  };

  return {
    path: statePath,
    async ensure() {
      if (!(await exists(statePath))) {
        await fs.mkdir(path.dirname(statePath), { recursive: true });
        await fs.writeFile(statePath, JSON.stringify(defaults, null, 2));
      }
    },
    async read() {
      try {
        return { ...defaults, ...JSON.parse(await fs.readFile(statePath, "utf8")) };
      } catch {
        return { ...defaults };
      }
    },
    async write(nextState) {
      writeQueue = writeQueue.then(async () => {
        const current = await this.read();
        const merged = { ...current, ...nextState, updated_at: new Date().toISOString() };
        await fs.mkdir(path.dirname(statePath), { recursive: true });
        await fs.writeFile(statePath, JSON.stringify(merged, null, 2));
        return merged;
      });
      return writeQueue;
    }
  };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
