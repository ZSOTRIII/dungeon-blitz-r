import * as fs from 'fs';
import * as path from 'path';
import { ensureBackup, parseSwz, writeSwz } from './swzPatchUtils';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MIN_HOME_TIMER_SECONDS = 12 * 60 * 60;
const MAX_HOME_TIMER_SECONDS = 3 * 24 * 60 * 60;
const DATA_FILES = [
    {
        label: 'BuildingTypes',
        xmlPath: path.join(ROOT, 'src', 'client', 'content', 'xml', 'BuildingTypes.xml'),
        jsonPath: path.join(ROOT, 'src', 'server', 'data', 'BuildingTypes.json'),
        prettyJson: true
    },
    {
        label: 'AbilityTypes',
        xmlPath: path.join(ROOT, 'src', 'client', 'content', 'xml', 'AbilityTypes.xml'),
        jsonPath: path.join(ROOT, 'src', 'server', 'data', 'AbilityTypes.json'),
        prettyJson: false
    }
];
const GAME_SWZ_FILES = ['Game.swz', 'Game.en.swz', 'Game.tr.swz'].map((fileName) =>
    path.join(ROOT, 'src', 'client', 'content', 'localhost', 'p', 'cbq', fileName)
);

function clampUpgradeTimeValue(value: string): string {
    const numeric = Math.max(0, Math.round(Number(value || 0)));
    if (numeric <= 0) {
        return '0';
    }
    return String(Math.max(MIN_HOME_TIMER_SECONDS, Math.min(numeric, MAX_HOME_TIMER_SECONDS)));
}

function clampXmlUpgradeTimes(xml: string): { xml: string; changes: number } {
    let changes = 0;
    const nextXml = xml.replace(/<UpgradeTime>(\d+)<\/UpgradeTime>/g, (match, value: string) => {
        const capped = clampUpgradeTimeValue(value);
        if (capped !== value) {
            changes += 1;
            return `<UpgradeTime>${capped}</UpgradeTime>`;
        }
        return match;
    });
    return { xml: nextXml, changes };
}

function verifyXmlUpgradeTimes(xml: string, label: string): void {
    for (const match of xml.matchAll(/<UpgradeTime>(\d+)<\/UpgradeTime>/g)) {
        const value = Number(match[1] ?? 0);
        if (value > 0 && (value < MIN_HOME_TIMER_SECONDS || value > MAX_HOME_TIMER_SECONDS)) {
            throw new Error(`${label} keeps UpgradeTime ${value}, outside ${MIN_HOME_TIMER_SECONDS}-${MAX_HOME_TIMER_SECONDS}`);
        }
    }
}

function patchLooseXml(filePath: string, verify: boolean): number {
    const original = fs.readFileSync(filePath, 'utf8');
    if (verify) {
        verifyXmlUpgradeTimes(original, filePath);
        return 0;
    }

    const patched = clampXmlUpgradeTimes(original);
    if (patched.changes > 0) {
        fs.writeFileSync(filePath, patched.xml, 'utf8');
    }
    verifyXmlUpgradeTimes(patched.xml, filePath);
    return patched.changes;
}

function patchJson(filePath: string, pretty: boolean, verify: boolean): number {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<Record<string, unknown>>;
    let changes = 0;
    for (const entry of data) {
        const current = String(entry.UpgradeTime ?? '0');
        const capped = clampUpgradeTimeValue(current);
        if (capped !== current) {
            entry.UpgradeTime = capped;
            changes += 1;
        }
    }

    if (verify) {
        if (changes > 0) {
            throw new Error(`${filePath} keeps ${changes} UpgradeTime values outside ${MIN_HOME_TIMER_SECONDS}-${MAX_HOME_TIMER_SECONDS}`);
        }
        return 0;
    }

    if (changes > 0) {
        fs.writeFileSync(filePath, pretty ? `${JSON.stringify(data, null, 4)}\n` : JSON.stringify(data));
    }
    return changes;
}

function patchGameSwz(swzPath: string, verify: boolean): number {
    const ctx = parseSwz(swzPath);
    let changes = 0;
    let matchedChunks = 0;

    for (const chunk of ctx.chunks) {
        if (!chunk.xml.includes('<BuildingTypes') && !chunk.xml.includes('<AbilityTypes')) {
            continue;
        }
        matchedChunks += 1;
        if (verify) {
            verifyXmlUpgradeTimes(chunk.xml, `${swzPath} chunk ${chunk.index}`);
            continue;
        }

        const patched = clampXmlUpgradeTimes(chunk.xml);
        if (patched.changes > 0) {
            chunk.xml = patched.xml;
            changes += patched.changes;
        }
        verifyXmlUpgradeTimes(chunk.xml, `${swzPath} chunk ${chunk.index}`);
    }

    if (matchedChunks !== 2) {
        throw new Error(`${swzPath} should contain BuildingTypes and AbilityTypes chunks, found ${matchedChunks}`);
    }

    if (!verify && changes > 0) {
        ensureBackup(swzPath);
        writeSwz(ctx);
    }
    return changes;
}

function main(): void {
    const verify = process.argv.includes('--verify');
    let totalChanges = 0;

    for (const file of DATA_FILES) {
        totalChanges += patchLooseXml(file.xmlPath, verify);
        totalChanges += patchJson(file.jsonPath, file.prettyJson, verify);
    }
    for (const swzPath of GAME_SWZ_FILES) {
        totalChanges += patchGameSwz(swzPath, verify);
    }

    const mode = verify ? 'Verified' : 'Patched';
    console.log(`${mode} home timers between ${MIN_HOME_TIMER_SECONDS}s and ${MAX_HOME_TIMER_SECONDS}s (${totalChanges} changes)`);
}

main();
