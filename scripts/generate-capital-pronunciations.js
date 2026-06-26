/**
 * Generate capital name pronunciation MP3s via AWS Polly.
 *
 * Reads data/countries.json and writes:
 *   public/audio/{outputDir}/{iso3}.mp3   (ISO3 country code, lowercase)
 *
 * Required env (e.g. in .env):
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION              (default: us-east-1)
 *
 * Optional env:
 *   POLLY_VOICE             (default: Joanna)
 *   POLLY_ENGINE            (default: neural — falls back to standard if unsupported)
 *   POLLY_OUTPUT_DIR        (default: pronunciation-capitals)
 *
 * Usage:
 *   npm run generate-capital-pronunciations
 *   npm run generate-capital-pronunciations -- --both-voices
 *   npm run generate-capital-pronunciations -- --force
 *   npm run generate-capital-pronunciations -- --output-dir pronunciation-capitals2
 *   npm run generate-capital-pronunciations -- --country USA
 *   npm run generate-capital-pronunciations -- --all
 *   npm run generate-capital-pronunciations -- --limit 5
 */

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const countriesPath = join(root, "data/countries.json");
const DEFAULT_OUTPUT_DIR = "pronunciation-capitals";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_VOICE = "Joanna";
const DEFAULT_ENGINE = "neural";
const REQUEST_DELAY_MS = 150;

const BOTH_VOICE_RUNS = [
  { voiceId: "Joanna", outputDir: "pronunciation-capitals" },
  { voiceId: "Matthew", outputDir: "pronunciation-capitals2" },
];

function parseArgs(argv) {
  const options = {
    force: false,
    all: false,
    bothVoices: false,
    limit: null,
    country: null,
    outputDir: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg === "--both-voices") {
      options.bothVoices = true;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--country") {
      options.country = String(argv[i + 1] ?? "").toUpperCase();
      i += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = String(argv[i + 1] ?? "").trim();
      i += 1;
    }
  }

  return options;
}

function resolveOutputDir(folder) {
  if (!folder || folder.includes("/") || folder.includes("..")) {
    throw new Error(`Invalid output directory: ${folder}`);
  }
  return join(root, "public/audio", folder);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCountries({ all, country }) {
  const manifest = JSON.parse(readFileSync(countriesPath, "utf8"));
  let countries = manifest.countries ?? [];

  if (country) {
    countries = countries.filter((entry) => entry.iso3 === country);
    if (countries.length === 0) {
      throw new Error(`Country not found in manifest: ${country}`);
    }
    return countries;
  }

  if (!all) {
    countries = countries.filter((entry) => entry.enabled);
  }

  return countries.sort((a, b) => a.iso3.localeCompare(b.iso3));
}

function getPollyConfig(voiceIdOverride) {
  const region = process.env.AWS_REGION || DEFAULT_REGION;
  const voiceId = voiceIdOverride || process.env.POLLY_VOICE || DEFAULT_VOICE;
  const engine = process.env.POLLY_ENGINE || DEFAULT_ENGINE;

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "Missing AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env"
    );
  }

  return {
    client: new PollyClient({ region }),
    voiceId,
    engine,
  };
}

async function synthesizeToFile({ client, voiceId, engine, text, outputPath }) {
  const run = async (selectedEngine) => {
    const command = new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      Text: text,
      TextType: "text",
      VoiceId: voiceId,
      Engine: selectedEngine,
    });
    const response = await client.send(command);
    if (!response.AudioStream) {
      throw new Error("Polly returned no audio stream");
    }
    await pipeline(response.AudioStream, createWriteStream(outputPath));
  };

  try {
    await run(engine);
  } catch (error) {
    const message = error?.message ?? "";
    const engineUnsupported =
      engine !== "standard" &&
      (message.includes("Engine") ||
        message.includes("engine") ||
        message.includes("ValidationException"));

    if (!engineUnsupported) throw error;

    console.warn(`  ↳ ${voiceId}/${engine} unavailable, retrying with standard engine`);
    await run("standard");
  }
}

async function generateForVoice({ voiceId, outputDirName, countries, options }) {
  const { client, voiceId: resolvedVoiceId, engine } = getPollyConfig(voiceId);
  const outputDir = resolveOutputDir(outputDirName);

  mkdirSync(outputDir, { recursive: true });

  console.log(
    `\nGenerating ${countries.length} capital pronunciation(s) → ${outputDir}\n` +
      `Voice: ${resolvedVoiceId} (${engine}), region: ${process.env.AWS_REGION || DEFAULT_REGION}\n`
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let noCapital = 0;

  for (const country of countries) {
    const capital = String(country.capital ?? "").trim();
    if (!capital) {
      noCapital += 1;
      console.log(`skip ${country.iso3} (no capital)`);
      continue;
    }

    const code = country.iso3.toLowerCase();
    const outputPath = join(outputDir, `${code}.mp3`);

    if (!options.force && existsSync(outputPath)) {
      skipped += 1;
      console.log(`skip ${country.iso3} (exists)`);
      continue;
    }

    process.stdout.write(`${country.iso3}  ${capital} … `);

    try {
      await synthesizeToFile({
        client,
        voiceId: resolvedVoiceId,
        engine,
        text: capital,
        outputPath,
      });
      created += 1;
      console.log("ok");
    } catch (error) {
      failed += 1;
      console.log("failed");
      console.error(`  ${error.message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `\nDone (${resolvedVoiceId}). created=${created} skipped=${skipped} noCapital=${noCapital} failed=${failed}`
  );

  return failed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let countries = loadCountries(options);

  if (options.limit != null && Number.isFinite(options.limit) && options.limit > 0) {
    countries = countries.slice(0, options.limit);
  }

  let totalFailed = 0;

  if (options.bothVoices) {
    for (const run of BOTH_VOICE_RUNS) {
      totalFailed += await generateForVoice({
        voiceId: run.voiceId,
        outputDirName: run.outputDir,
        countries,
        options,
      });
    }
  } else {
    const outputDirName =
      options.outputDir || process.env.POLLY_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
    totalFailed += await generateForVoice({
      voiceId: null,
      outputDirName,
      countries,
      options,
    });
  }

  if (totalFailed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
