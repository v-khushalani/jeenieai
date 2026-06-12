#!/usr/bin/env python3
from datasets import load_dataset
import json

ds = load_dataset('datavorous/entrance-exam-dataset', split='train')
count = 0
print('Printing first 10 rows (as JSON)')
for row in ds:
    print(json.dumps({k: (row[k] if k in row else None) for k in list(row.keys())[:20]}, ensure_ascii=False))
    count += 1
    if count >= 10:
        break
