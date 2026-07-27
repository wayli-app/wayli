#!/usr/bin/env python3
"""
Translate new and changed i18n keys from en.json to all other locale files.

Three modes:
  Default: translate new keys + keys whose English value changed since last run.
  --full-resync: re-translate EVERYTHING (overwrite all existing translations).
  --langs nl de fr: limit to specific languages.

Uses a snapshot file (en.snapshot.json) to detect value changes between runs.
After a successful run, the snapshot is updated to match the current en.json.

Usage:
  cd web/static/messages
  python3 translate_new_keys.py              # translate new + changed keys
  python3 translate_new_keys.py --full-resync  # re-translate everything
  python3 translate_new_keys.py --langs nl de  # specific languages only
"""

import json
import asyncio
import sys
import os
from googletrans import Translator

# ── Config ──
TARGET_LANGS = {
    'nl': 'nl', 'de': 'de', 'fr': 'fr', 'es': 'es',
    'it': 'it', 'pt': 'pt', 'ru': 'ru', 'ja': 'ja',
    'ko': 'ko', 'zh': 'zh-cn',
}

DIR = os.path.dirname(os.path.abspath(__file__))
SNAPSHOT_FILE = os.path.join(DIR, 'en.snapshot.json')


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data, filepath):
    indent = '\t' if filepath.endswith('.json') and '/messages/' in filepath else 2
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        f.write('\n')


def extract_keys(data, prefix=''):
    """Extract all dot-notation keys from a nested dict."""
    keys = set()
    for k, v in data.items():
        full = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys |= extract_keys(v, full)
        else:
            keys.add(full)
    return keys


def get_nested(data, path):
    """Get a value from nested dict using dot notation."""
    cur = data
    for k in path.split('.'):
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur


def set_nested(data, path, value):
    """Set a value in nested dict using dot notation."""
    cur = data
    keys = path.split('.')
    for k in keys[:-1]:
        if k not in cur:
            cur[k] = {}
        cur = cur[k]
    cur[keys[-1]] = value


def find_changed_keys(en, snapshot):
    """Find keys whose English value changed since the last snapshot."""
    if not snapshot:
        return set()
    en_keys = extract_keys(en)
    snapshot_keys = extract_keys(snapshot)
    changed = set()
    for key in en_keys & snapshot_keys:
        en_val = get_nested(en, key)
        snap_val = get_nested(snapshot, key)
        if isinstance(en_val, str) and isinstance(snap_val, str) and en_val != snap_val:
            changed.add(key)
    return changed


async def translate_keys(langs_to_translate, full_resync=False):
    # Load English source
    en = load_json(os.path.join(DIR, 'en.json'))
    en_keys = extract_keys(en)

    # Load snapshot to detect value changes
    snapshot = load_json(SNAPSHOT_FILE) if os.path.exists(SNAPSHOT_FILE) else {}
    changed_keys = find_changed_keys(en, snapshot)

    if changed_keys and not full_resync:
        print(f"  Detected {len(changed_keys)} changed English values since last run:")
        for key in sorted(changed_keys)[:10]:
            old_val = get_nested(snapshot, key)
            new_val = get_nested(en, key)
            print(f"    {key}: {old_val!r} → {new_val!r}")
        if len(changed_keys) > 10:
            print(f"    ... and {len(changed_keys) - 10} more")
        print()

    translator = Translator()

    for file_lang, google_lang in langs_to_translate.items():
        filename = f'{file_lang}.json'
        filepath = os.path.join(DIR, filename)

        if not os.path.exists(filepath):
            print(f"  Skipping {filename} — file not found")
            continue

        target = load_json(filepath)
        target_keys = extract_keys(target)

        # Determine which keys to translate
        if full_resync:
            # Re-translate everything
            keys_to_translate = sorted(k for k in en_keys
                                       if isinstance(get_nested(en, k), str))
        else:
            # New keys (missing from target) + changed keys (English value drifted)
            missing_keys = en_keys - target_keys
            keys_to_translate = sorted((missing_keys | changed_keys)
                                       - (target_keys - changed_keys))

        # Filter to string values only
        to_translate = []
        for kp in keys_to_translate:
            val = get_nested(en, kp)
            if val and isinstance(val, str):
                to_translate.append((kp, val))

        if not to_translate:
            print(f"  {filename}: up to date, skipping")
            continue

        reason = 'all keys' if full_resync else f'{len(missing_keys if not full_resync else set())} new + {len(changed_keys)} changed'
        print(f"  {filename}: {len(to_translate)} keys to translate ({reason})")

        done = 0
        errors = 0
        for kp, en_val in to_translate:
            try:
                result = await translator.translate(en_val, dest=google_lang)
                set_nested(target, kp, result.text)
                done += 1

                if done % 25 == 0:
                    print(f"    {done}/{len(to_translate)}")
                    save_json(target, filepath)

                await asyncio.sleep(0.03)

            except Exception as e:
                # Fallback to English
                set_nested(target, kp, en_val)
                errors += 1
                print(f"    Error: {kp}: {e}")

        save_json(target, filepath)
        print(f"    ✓ {filename}: {done} translated, {errors} errors")

        await asyncio.sleep(1)

    # Update snapshot to match current en.json
    save_json(en, SNAPSHOT_FILE)
    print(f"\n  Snapshot updated → {os.path.basename(SNAPSHOT_FILE)}")


def main():
    full_resync = '--full-resync' in sys.argv

    # Parse args for specific languages
    if '--langs' in sys.argv:
        idx = sys.argv.index('--langs')
        requested = sys.argv[idx + 1:]
        langs = {k: v for k, v in TARGET_LANGS.items() if k in requested}
    else:
        # Remove flags from args before processing
        langs = TARGET_LANGS

    print("=" * 60)
    if full_resync:
        print("FULL RESYNC: re-translating ALL keys to all languages")
    else:
        print(f"Translating new + changed keys to: {', '.join(langs.keys())}")
    print("=" * 60 + "\n")

    try:
        asyncio.run(translate_keys(langs, full_resync))
        print("\n" + "=" * 60)
        print("✓ Translation complete!")
        print("=" * 60)
    except KeyboardInterrupt:
        print("\n\nInterrupted — progress was saved. Re-run to continue.")
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
