import re, json, os

root = os.path.dirname(os.path.abspath(__file__))
css_path = os.path.join(root, 'css', 'tafseel.css')
with open(css_path, encoding='utf-8') as fh:
    css = fh.read()

with open(os.path.join(root, '_html_usage.json'), encoding='utf-8') as fh:
    html_usage = json.load(fh)

html_classes = set(html_usage['classes'].keys())
html_ids = set(html_usage['ids'].keys())

# Strip comments to isolate rule blocks, but keep line numbers by replacing comment content with spaces (not newlines removed)
def strip_comments_keep_lines(text):
    out = []
    i = 0
    n = len(text)
    while i < n:
        if text[i:i+2] == '/*':
            end = text.find('*/', i+2)
            if end == -1:
                # rest is comment
                for ch in text[i:]:
                    out.append('\n' if ch == '\n' else ' ')
                break
            else:
                for ch in text[i:end+2]:
                    out.append('\n' if ch == '\n' else ' ')
                i = end + 2
                continue
        else:
            out.append(text[i])
            i += 1
    return ''.join(out)

css_nc = strip_comments_keep_lines(css)

# Find selector blocks: text before each '{' that isn't part of @media/@keyframes/@font-face parens
# We'll walk brace by brace, tracking nesting for @media etc.
line_starts = [0]
for idx, ch in enumerate(css_nc):
    if ch == '\n':
        line_starts.append(idx+1)

def line_of(pos):
    import bisect
    return bisect.bisect_right(line_starts, pos)

selectors_found = []  # (selector_text, line_number)

i = 0
n = len(css_nc)
depth = 0
buf = []
buf_start = 0
at_rule_depth_stack = []  # track if current depth-1 context is an at-rule wrapper (@media/@supports) vs a normal rule
while i < n:
    ch = css_nc[i]
    if ch == '{':
        selector_text = css_nc[buf_start:i].strip()
        ln = line_of(buf_start) if selector_text else line_of(i)
        # classify: at-rule (starts with @) opens a block that contains more rules
        is_at_rule = selector_text.startswith('@')
        if not is_at_rule and selector_text:
            selectors_found.append((selector_text, ln))
        depth += 1
        buf_start = i+1
        i += 1
        continue
    if ch == '}':
        depth -= 1
        buf_start = i+1
        i += 1
        continue
    i += 1

# Now extract class tokens (.foo) and id tokens (#foo) and attribute/tag/pseudo info from each selector
class_token_re = re.compile(r'\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)')
id_token_re = re.compile(r'#(-?[_a-zA-Z][_a-zA-Z0-9-]*)')

css_classes = {}  # class -> list of (selector, line)
css_ids = {}

for sel, ln in selectors_found:
    for m in class_token_re.finditer(sel):
        css_classes.setdefault(m.group(1), []).append((sel, ln))
    for m in id_token_re.finditer(sel):
        css_ids.setdefault(m.group(1), []).append((sel, ln))

css_class_set = set(css_classes.keys())
css_id_set = set(css_ids.keys())

# Missing in CSS: used in HTML classes, not present in css_class_set
missing_in_css = sorted(html_classes - css_class_set)
missing_ids_in_css = sorted(html_ids - css_id_set)

# Dead in CSS: css classes never used in HTML
dead_css_classes = sorted(css_class_set - html_classes)
dead_css_ids = sorted(css_id_set - html_ids)

result = {
    'total_selectors': len(selectors_found),
    'css_classes_count': len(css_class_set),
    'css_ids_count': len(css_id_set),
    'missing_in_css_classes': {c: html_usage['classes'][c] for c in missing_in_css},
    'missing_in_css_ids': {c: html_usage['ids'][c] for c in missing_ids_in_css},
    'dead_css_classes': {c: [f"{s} (line {l})" for s,l in css_classes[c]] for c in dead_css_classes},
    'dead_css_ids': {c: [f"{s} (line {l})" for s,l in css_ids[c]] for c in dead_css_ids},
}

with open(os.path.join(root, '_css_diff.json'), 'w', encoding='utf-8') as fh:
    json.dump(result, fh, ensure_ascii=False, indent=2)

print("Total selector blocks (non-at-rule):", len(selectors_found))
print("CSS classes:", len(css_class_set))
print("CSS ids:", len(css_id_set))
print("Missing in CSS (used in HTML, no CSS rule) - classes:", len(missing_in_css))
print(missing_in_css)
print("Missing in CSS - ids:", len(missing_ids_in_css))
print(missing_ids_in_css)
print("Dead CSS classes (defined, unused in HTML):", len(dead_css_classes))
print(dead_css_classes)
print("Dead CSS ids:", len(dead_css_ids))
print(dead_css_ids)
