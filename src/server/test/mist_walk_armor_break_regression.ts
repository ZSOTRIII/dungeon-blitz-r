import * as fs from "fs";
import * as path from "path";
import { assertMistWalkArmorBreak } from "../scripts/patch_gameswz_mist_walk_armor_break";
import { parseSwz } from "../scripts/swzPatchUtils";

const ROOT = path.resolve(__dirname, "..", "..");
const XML_DIR = path.join(ROOT, "client", "content", "xml");
const CBQ_DIR = path.join(ROOT, "client", "content", "localhost", "p", "cbq");

function swzChunk(swzPath: string, marker: string): string {
  const chunk = parseSwz(swzPath).chunks.find((entry) => entry.xml.includes(marker));
  if (!chunk) {
    throw new Error(`${path.basename(swzPath)} must contain ${marker}`);
  }
  return chunk.xml;
}

assertMistWalkArmorBreak(
  fs.readFileSync(path.join(XML_DIR, "PlayerPowerTypes.xml"), "utf8"),
  fs.readFileSync(path.join(XML_DIR, "PlayerBuffTypes.xml"), "utf8"),
  "loose XML",
);

for (const fileName of ["Game.swz", "Game.en.swz", "Game.tr.swz"]) {
  const swzPath = path.join(CBQ_DIR, fileName);
  assertMistWalkArmorBreak(
    swzChunk(swzPath, "<PlayerPowerTypes"),
    swzChunk(swzPath, "<PlayerBuffTypes"),
    fileName,
  );
}

console.log("mist_walk_armor_break_regression passed");
