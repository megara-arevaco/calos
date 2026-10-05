"""Import the official USDA SR Legacy release. Run: python3 scripts/import-usda.py [archive.zip]."""
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import urllib.request
import zipfile

URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip'
archive = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(URL, timeout=60).read()
with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
    original = json.loads(zipped.read(next(name for name in zipped.namelist() if name.endswith('.json'))))['SRLegacyFoods']
foods = []
for food in original:
    nutrients = {entry['nutrient']['id']: entry.get('amount') for entry in food['foodNutrients']}
    values = [nutrients.get(key) for key in [1008, 1003, 1005, 1004]]
    if not all(isinstance(value, (int, float)) and math.isfinite(value) and value >= 0 for value in values):
        continue  # Missing nutrients are never silently replaced with zero.
    portions = []
    for portion in food.get('foodPortions', []):
        amount, grams = portion.get('amount'), portion.get('gramWeight')
        if not isinstance(amount, (int, float)) or not isinstance(grams, (int, float)) or amount <= 0 or grams <= 0:
            continue
        unit = portion.get('measureUnit', {}).get('name', '')
        label = ' '.join(part for part in [unit if unit != 'undetermined' else '', portion.get('modifier', '')] if part)
        if label:
            portions.append({'description': label, 'amount': amount, 'grams': grams})
    foods.append({'fdcId': food['fdcId'], 'description': food['description'], 'per100g': dict(zip(['calories', 'protein', 'carbs', 'fat'], values)), 'portions': portions})
result = {'source': 'USDA FoodData Central — SR Legacy', 'release': '2018-04', 'license': 'CC0-1.0', 'url': URL, 'archiveSha256': hashlib.sha256(archive).hexdigest(), 'foods': foods}
target = Path(__file__).resolve().parents[1] / 'packages/core/src/nutrition/data/usda-sr-legacy.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Imported {len(foods)} complete foods out of {len(original)} into {target} ({target.stat().st_size:,} bytes)')
