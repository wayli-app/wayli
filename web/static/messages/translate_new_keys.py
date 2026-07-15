#!/usr/bin/env python3
"""
Translate new i18n keys from en.json to all other locale files.
Skips keys that already exist in the target file.
Can be safely re-run if interrupted.

Usage:
  cd web/static/messages
  python3 translate_new_keys.py

To translate specific languages only:
  python3 translate_new_keys.py --langs nl de fr
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


def load_json(filename):
    with open(os.path.join(DIR, filename), 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data, filename):
    with open(os.path.join(DIR, filename), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent='\t')
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


async def translate_keys(langs_to_translate):
    # Load English source
    en = load_json('en.json')
    en_keys = extract_keys(en)

    translator = Translator()

    for file_lang, google_lang in langs_to_translate.items():
        filename = f'{file_lang}.json'
        filepath = os.path.join(DIR, filename)

        if not os.path.exists(filepath):
            print(f"  Skipping {filename} — file not found")
            continue

        target = load_json(filename)
        target_keys = extract_keys(target)

        # Find keys that exist in EN but not in target
        missing_keys = sorted(en_keys - target_keys)

        if not missing_keys:
            print(f"  {filename}: up to date, skipping")
            continue

        # Extract (key, value) pairs to translate
        to_translate = []
        for kp in missing_keys:
            val = get_nested(en, kp)
            if val and isinstance(val, str):
                to_translate.append((kp, val))

        print(f"  {filename}: {len(to_translate)} new keys to translate")

        done = 0
        errors = 0
        for kp, en_val in to_translate:
            try:
                result = await translator.translate(en_val, dest=google_lang)
                set_nested(target, kp, result.text)
                done += 1

                if done % 25 == 0:
                    print(f"    {done}/{len(to_translate)}")
                    # Save progress periodically so re-runs skip completed keys
                    save_json(target, filename)

                await asyncio.sleep(0.03)

            except Exception as e:
                # Fallback to English
                set_nested(target, kp, en_val)
                errors += 1
                print(f"    Error: {kp}: {e}")

        save_json(target, filename)
        print(f"    ✓ {filename}: {done} translated, {errors} errors")

        # Brief pause between languages
        await asyncio.sleep(1)


def main():
    # Parse args for specific languages
    if '--langs' in sys.argv:
        idx = sys.argv.index('--langs')
        requested = sys.argv[idx + 1:]
        langs = {k: v for k, v in TARGET_LANGS.items() if k in requested}
    else:
        langs = TARGET_LANGS

    print("=" * 60)
    print(f"Translating new keys to: {', '.join(langs.keys())}")
    print("=" * 60 + "\n")

    try:
        asyncio.run(translate_keys(langs))
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
