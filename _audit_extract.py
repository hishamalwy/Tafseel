import re, glob, json, os

root = os.path.dirname(os.path.abspath(__file__))
html_files = sorted(glob.glob(os.path.join(root, 'Tafseel-*.dc.html')))

class_usage = {}  # class -> set(files)
id_usage = {}      # id -> set(files)
data_attr_usage = {}

class_re = re.compile(r'class="([^"]*)"')
id_re = re.compile(r'\bid="([^"]*)"')
data_re = re.compile(r'\bdata-([a-zA-Z0-9-]+)(?:="([^"]*)")?')

for f in html_files:
    name = os.path.basename(f)
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    for m in class_re.finditer(content):
        classes = m.group(1)
        # remove templating expressions like {{ toastClass }} entirely before tokenizing,
        # so a bare identifier inside the braces (e.g. "cardClass") isn't misread as a literal class
        classes_clean = re.sub(r'\{\{.*?\}\}', ' ', classes)
        for c in classes_clean.split():
            class_usage.setdefault(c, set()).add(name)
    for m in id_re.finditer(content):
        idv = m.group(1)
        if '{{' in idv or '}}' in idv:
            continue
        id_usage.setdefault(idv, set()).add(name)
    for m in data_re.finditer(content):
        attr = m.group(1)
        data_attr_usage.setdefault(attr, set()).add(name)

# Also capture dynamic class expressions like class="{{ toastClass }}" separately
dynamic_class_re = re.compile(r'class="(\{\{[^"]*\}\})"')
dynamic_classes = {}
for f in html_files:
    name = os.path.basename(f)
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    for m in dynamic_class_re.finditer(content):
        dynamic_classes.setdefault(m.group(1), set()).add(name)

out = {
    'classes': {k: sorted(v) for k, v in sorted(class_usage.items())},
    'ids': {k: sorted(v) for k, v in sorted(id_usage.items())},
    'data_attrs': {k: sorted(v) for k, v in sorted(data_attr_usage.items())},
    'dynamic_class_exprs': {k: sorted(v) for k, v in sorted(dynamic_classes.items())},
}

with open(os.path.join(root, '_html_usage.json'), 'w', encoding='utf-8') as fh:
    json.dump(out, fh, ensure_ascii=False, indent=2)

print("Files scanned:", len(html_files))
print("Unique classes:", len(class_usage))
print("Unique ids:", len(id_usage))
print("Unique data-* attrs:", len(data_attr_usage))
