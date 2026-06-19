#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const videoExtensions = new Set([".mp4", ".webm", ".mkv", ".mov", ".m4v"]);

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.source) {
    console.error("Missing --source <dir>.");
    printUsage();
    process.exit(1);
  }

  const sourceRoot = path.resolve(options.source);
  const destRoot = path.resolve(options.dest ?? `${sourceRoot}-optimized`);

  if (isInside(sourceRoot, destRoot)) {
    throw new Error("--dest must not be inside --source; generated files would be scanned again.");
  }

  const files = await findVideos(sourceRoot);
  if (files.length === 0) {
    console.log(`No video files found under ${sourceRoot}`);
    return;
  }

  const results = [];
  for (const file of files) {
    const relativePath = path.relative(sourceRoot, file);
    const outputPath = outputFor(destRoot, relativePath);
    const probe = await probeVideo(file, options.ffprobe);
    const decision = decide(file, probe, outputPath, options);

    results.push({ file, relativePath, outputPath, probe, decision, sourceRoot, destRoot });
  }

  printReport(results, options, sourceRoot, destRoot);

  if (options.apply) {
    for (const result of results) {
      await writeOptimized(result, options);
    }
  } else {
    console.log("");
    console.log("Dry run only. Re-run with --apply to write optimized files.");
  }
}

function parseArgs(args) {
  const parsed = {
    apply: false,
    force: false,
    help: false,
    maxWidth: 1920,
    maxHeight: 1080,
    maxFps: 30,
    maxBitrate: "8000k",
    maxBitrateMbps: 8,
    bufferSize: "16000k",
    crf: 23,
    preset: "medium",
    stripAudio: true,
    ffmpeg: toolCommand(process.env.FFMPEG, "ffmpeg"),
    ffprobe: toolCommand(process.env.FFPROBE, "ffprobe")
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      index += 1;
      if (index >= args.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return args[index];
    };

    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--":
        break;
      case "--source":
        parsed.source = next();
        break;
      case "--dest":
        parsed.dest = next();
        break;
      case "--apply":
        parsed.apply = true;
        break;
      case "--force":
        parsed.force = true;
        break;
      case "--max-width":
        parsed.maxWidth = positiveInteger(next(), arg);
        break;
      case "--max-height":
        parsed.maxHeight = positiveInteger(next(), arg);
        break;
      case "--max-fps":
        parsed.maxFps = positiveNumber(next(), arg);
        break;
      case "--maxrate":
        parsed.maxBitrate = next();
        parsed.maxBitrateMbps = bitrateToMbps(parsed.maxBitrate);
        break;
      case "--bufsize":
        parsed.bufferSize = next();
        break;
      case "--crf":
        parsed.crf = positiveInteger(next(), arg);
        break;
      case "--preset":
        parsed.preset = next();
        break;
      case "--keep-audio":
        parsed.stripAudio = false;
        break;
      case "--ffmpeg":
        parsed.ffmpeg = next();
        break;
      case "--ffprobe":
        parsed.ffprobe = next();
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option ${arg}`);
        }
        if (!parsed.source) {
          parsed.source = arg;
        } else if (!parsed.dest) {
          parsed.dest = arg;
        } else {
          throw new Error(`Unexpected positional argument ${arg}`);
        }
    }
  }

  return parsed;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function toolCommand(value, binaryName) {
  if (!value) {
    return binaryName;
  }

  const basename = path.basename(value).toLowerCase();
  if (basename === binaryName || basename === `${binaryName}.exe`) {
    return value;
  }

  if (basename === "bin" || value.endsWith("/") || value.endsWith("\\")) {
    return path.join(value, process.platform === "win32" ? `${binaryName}.exe` : binaryName);
  }

  return value;
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return number;
}

async function findVideos(root) {
  const found = [];

  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && videoExtensions.has(path.extname(entry.name).toLowerCase())) {
        found.push(fullPath);
      }
    }
  }

  await walk(root);
  return found.sort((a, b) => a.localeCompare(b));
}

async function probeVideo(file, ffprobe) {
  const output = await run(ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,profile,width,height,r_frame_rate,avg_frame_rate,pix_fmt,bit_rate",
    "-show_entries",
    "format=duration,bit_rate,format_name",
    "-of",
    "json",
    file
  ]);
  const parsed = JSON.parse(output.stdout);
  const stream = parsed.streams?.[0] ?? {};
  const format = parsed.format ?? {};
  const fps = parseFps(stream.avg_frame_rate || stream.r_frame_rate);
  return {
    codec: stream.codec_name ?? "unknown",
    profile: stream.profile ?? "",
    width: Number(stream.width) || 0,
    height: Number(stream.height) || 0,
    fps,
    pixFmt: stream.pix_fmt ?? "unknown",
    durationSeconds: Number(format.duration) || 0,
    bitrateMbps: bitrateToMbps(format.bit_rate ?? stream.bit_rate ?? 0)
  };
}

function decide(file, probe, outputPath, opts) {
  const reasons = [];
  if (path.extname(file).toLowerCase() !== ".mp4") {
    reasons.push(`container ${path.extname(file).toLowerCase() || "unknown"}`);
  }
  if (probe.codec !== "h264") {
    reasons.push(`codec ${probe.codec}`);
  }
  if (probe.pixFmt !== "yuv420p") {
    reasons.push(`pixel format ${probe.pixFmt}`);
  }
  if (probe.width > opts.maxWidth || probe.height > opts.maxHeight) {
    reasons.push(`${probe.width}x${probe.height}`);
  }
  if (probe.fps > opts.maxFps) {
    reasons.push(`${probe.fps}fps`);
  }
  if (probe.bitrateMbps > opts.maxBitrateMbps) {
    reasons.push(`${probe.bitrateMbps}Mbps`);
  }

  return {
    action: reasons.length > 0 ? "transcode" : "copy",
    reasons,
    outputPath
  };
}

async function writeOptimized(result, opts) {
  const exists = await fileExists(result.outputPath);
  if (exists && !opts.force) {
    console.log(`skip existing ${result.relativePath}`);
    return;
  }

  await fs.mkdir(path.dirname(result.outputPath), { recursive: true });
  if (result.decision.action === "copy") {
    await fs.copyFile(result.file, result.outputPath);
    console.log(`copy ${result.relativePath}`);
    return;
  }

  const filters = [];
  if (result.probe.width > opts.maxWidth || result.probe.height > opts.maxHeight) {
    filters.push(`scale=w='min(${opts.maxWidth},iw)':h='min(${opts.maxHeight},ih)':force_original_aspect_ratio=decrease`);
  }
  if (result.probe.fps > opts.maxFps) {
    filters.push(`fps=${opts.maxFps}`);
  }
  filters.push("format=yuv420p");

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    result.file,
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    opts.preset,
    "-crf",
    String(opts.crf),
    "-maxrate",
    opts.maxBitrate,
    "-bufsize",
    opts.bufferSize,
    "-movflags",
    "+faststart"
  ];

  if (opts.stripAudio) {
    args.push("-an");
  } else {
    args.push("-c:a", "aac", "-b:a", "128k");
  }

  args.push(result.outputPath);
  await run(opts.ffmpeg, args, { inheritStderr: true });
  console.log(`transcode ${result.relativePath}`);
}

function outputFor(destRoot, relativePath) {
  const parsed = path.parse(relativePath);
  return path.join(destRoot, parsed.dir, `${parsed.name}.mp4`);
}

function printReport(results, opts, sourceRoot, destRoot) {
  const transcode = results.filter((item) => item.decision.action === "transcode");
  const copy = results.length - transcode.length;

  console.log(`Source: ${sourceRoot}`);
  console.log(`Destination: ${destRoot}`);
  console.log(`Mode: ${opts.apply ? "apply" : "dry-run"}`);
  console.log(`Target: H.264 MP4, max ${opts.maxWidth}x${opts.maxHeight}, max ${opts.maxFps}fps, yuv420p, CRF ${opts.crf}, maxrate ${opts.maxBitrate}`);
  console.log(`Videos: ${results.length}; transcode: ${transcode.length}; copy: ${copy}`);
  console.log("");

  for (const item of results) {
    const p = item.probe;
    const reason = item.decision.reasons.join(", ") || "already within target";
    console.log([
      item.decision.action.padEnd(9),
      `${p.width}x${p.height}`.padEnd(10),
      `${formatNumber(p.fps)}fps`.padEnd(9),
      `${formatNumber(p.bitrateMbps)}Mbps`.padEnd(11),
      p.codec.padEnd(7),
      p.pixFmt.padEnd(8),
      item.relativePath,
      `(${reason})`
    ].join(" "));
  }
}

function parseFps(rate) {
  if (!rate || rate === "0/0") {
    return 0;
  }
  const [numerator, denominator] = String(rate).split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(3));
}

function bitrateToMbps(value) {
  if (typeof value === "string") {
    const match = value.match(/^([0-9.]+)([kKmM])?$/);
    if (match) {
      const number = Number(match[1]);
      const suffix = match[2]?.toLowerCase();
      if (suffix === "k") {
        return number / 1000;
      }
      if (suffix === "m") {
        return number;
      }
      return number / 1000000;
    }
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return number / 1000000;
}

function formatNumber(value) {
  return Number(value.toFixed(2)).toString();
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", options.inheritStderr ? "inherit" : "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Could not run ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with ${code}${stderr ? `: ${stderr}` : ""}`));
      }
    });
  });
}

function printUsage() {
  console.log(`Usage:
  node scripts/optimize-ambience-videos.js --source <videos-dir> [--dest <output-dir>] [--apply]

Defaults:
  dry-run report only
  destination: <source>-optimized
  target: H.264 MP4, max 1920x1080, max 30fps, yuv420p, CRF 23, maxrate 8000k

Options:
  --source <dir>       Source videos root, for example media/videos
  --dest <dir>         Output videos root; must not be inside source
  --apply              Write output files; omitted means dry-run only
  --force              Overwrite existing output files
  --max-width <n>      Default 1920
  --max-height <n>     Default 1080
  --max-fps <n>        Default 30
  --crf <n>            Default 23
  --maxrate <rate>     Default 8000k
  --bufsize <rate>     Default 16000k
  --preset <name>      Default medium
  --keep-audio         Keep audio as AAC 128k; default strips audio
  --ffmpeg <path>      Default ffmpeg
  --ffprobe <path>     Default ffprobe`);
}
