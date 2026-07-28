#!/usr/bin/env python3
"""Fix broken JSON files where inner ASCII quotes break JSON parsing."""
import json, os, re

base = '/Users/apple/Desktop/ai-learning-system/output/agent2_extraction/nodes'

for fn in sorted(os.listdir(base)):
    if not fn.endswith('.json'): continue
    path = os.path.join(base, fn)
    try:
        with open(path) as f: json.load(f)
        continue  # valid, skip
    except json.JSONDecodeError:
        pass
    
    print(f'Fixing {fn}...')
    with open(path) as f: raw = f.read()
    lines = raw.split('\n')
    fixed_lines = []
    
    for line in lines:
        s = line.lstrip()
        if s.count('"') < 4 or not (s.startswith('"') and '": "' in s):
            fixed_lines.append(line)
            continue
        
        prefix_end = s.index('": "') + 4
        indent = line[:len(line)-len(s)]
        key_val_start = s[:prefix_end]
        rest = s[prefix_end:]
        
        # Find the LAST '"' that closes
        if rest.endswith('",'):
            value = rest[:-2]
            suffix = '",'
        elif rest.endswith('"'):
            value = rest[:-1]
            suffix = '"'
        else:
            fixed_lines.append(line)
            continue
        
        # Replace inner " with Chinese 「」
        # Strategy: replace " if surrounded by non-structural chars
        chars = list(value)
        for i in range(1, len(chars)-1):
            if chars[i] == '"':
                prev = chars[i-1]
                nxt = chars[i+1]
                prev_ok = prev not in ' ,:[]{}()\n\t'
                nxt_ok = nxt not in ' ,:[]{}()\n\t\\'
                if prev_ok and nxt_ok:
                    chars[i] = '」' if nxt in '，。、；：）\n' else '「'
                    # Also fix matching pair - find next " and make it closing
                    for j in range(i+1, len(chars)):
                        if chars[j] == '"':
                            chars[j] = '」'
                            break
        
        new_value = ''.join(chars)
        
        if new_value.count('"') == 0:
            fixed_lines.append(indent + key_val_start + new_value + suffix)
        else:
            fixed_lines.append(line)
    
    result = '\n'.join(fixed_lines)
    
    try:
        json.loads(result)
        with open(path, 'w') as f: f.write(result)
        print(f'  ✅ Fixed')
    except json.JSONDecodeError as e:
        print(f'  ❌ Still at line {e.lineno}: {repr(result.split(chr(10))[e.lineno-1][:100])}')

print('Done')
