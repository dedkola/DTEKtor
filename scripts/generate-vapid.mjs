import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import webpush from "web-push";

export async function generateVapidFile(file = ".env.local") {
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (/^[ \t]*VAPID_(PUBLIC|PRIVATE)_KEY[ \t]*=[ \t]*\S+/m.test(existing)) {
    throw new Error(
      "VAPID keys already exist. Keep them: changing keys invalidates browser subscriptions.",
    );
  }
  const keys = webpush.generateVAPIDKeys();
  const cleaned = existing
    .replace(/^[ \t]*VAPID_(PUBLIC|PRIVATE)_KEY[ \t]*=[ \t]*\r?$/gm, "")
    .replace(/^[ \t]*VAPID_SUBJECT[ \t]*=[ \t]*\r?$/gm, "");
  const subject = /^[ \t]*VAPID_SUBJECT[ \t]*=[ \t]*\S+/m.test(cleaned)
    ? ""
    : "VAPID_SUBJECT=https://detektor.tkweb.dev\n";
  await writeFile(
    file,
    `${cleaned.trimEnd()}\n\n# Web Push: keep this key pair private and persistent.\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n${subject}`,
    { mode: 0o600 },
  );
  await chmod(file, 0o600);
  return path.resolve(file);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--file")) {
    console.error("Usage: npm run push:keys -- [--file .env.local]");
    process.exitCode = 1;
  } else {
    try {
      console.log(
        `VAPID credentials saved to ${await generateVapidFile(args[1])}. Restart the dashboard to enable Web Push.`,
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
