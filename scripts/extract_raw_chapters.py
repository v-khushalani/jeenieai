#!/usr/bin/env python3
import sys
from collections import Counter

try:
    from datasets import load_dataset
except Exception as e:
    print("Missing 'datasets' library. Please run: pip install datasets", file=sys.stderr)
    raise

def extract_field(row):
    # Try several common fields to find a raw chapter string
    for k in ('chapter', 'chapter_name', 'p_chapter', 'raw_chapter'):
        v = row.get(k) if isinstance(row, dict) else None
        if v:
            return str(v).strip()
    # tags field (list)
    tags = row.get('tags') if isinstance(row, dict) else None
    if tags:
        # tags might be a list or a string representation of a list
        if isinstance(tags, (list, tuple)):
            if len(tags) > 1:
                return str(tags[1]).strip()
            if len(tags) > 0:
                return str(tags[0]).strip()
        if isinstance(tags, str):
            # try to parse string like "['Physics','Chapter']"
            import ast
            try:
                parsed = ast.literal_eval(tags)
                if isinstance(parsed, (list, tuple)) and len(parsed) > 1:
                    return str(parsed[1]).strip()
                if isinstance(parsed, (list, tuple)) and len(parsed) > 0:
                    return str(parsed[0]).strip()
            except Exception:
                # fallback: split by comma
                parts = [p.strip().strip("'\"") for p in tags.split(',') if p.strip()]
                if len(parts) > 1:
                    return parts[1]
                if parts:
                    return parts[0]
    # fallback to exam or subject
    for k in ('exam', 'p_exam', 'subject'):
        v = row.get(k) if isinstance(row, dict) else None
        if v:
            return str(v).strip()
    return ''

def main():
    dataset_name = 'datavorous/entrance-exam-dataset'
    split = 'train'
    print(f'Loading dataset {dataset_name} split={split} (this may take a few minutes)...')
    ds = load_dataset(dataset_name, split=split)
    print('Dataset loaded. Scanning rows...')
    cnt = Counter()
    total = 0
    for row in ds:
        total += 1
        try:
            r = {k: row[k] for k in row.keys()}
        except Exception:
            r = row
        val = extract_field(r)
        if val:
            cnt[val] += 1
    print(f'Scanned {total} rows, found {len(cnt)} distinct raw chapter strings')
    out_path = '/tmp/top_raw_chapters.txt'
    with open(out_path, 'w', encoding='utf-8') as f:
        for k, v in cnt.most_common(200):
            f.write(f"{v}\t{k}\n")
    print('Wrote top 200 raw chapter strings to', out_path)
    print('\nTop 50:')
    for k, v in cnt.most_common(50):
        print(f"{v:6d}\t{k}")

if __name__ == '__main__':
    main()
