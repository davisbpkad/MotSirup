"""Read the source workbook without saving or changing it."""
import hashlib
import json
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'Rekap SIRUP_Perubahan 2026.xlsx'
PPKS = [
    ('siti', 'SITI SYAMSINUR, S.E., M.Acc., AAP', 'Siti Syamsinur', 'Sekretariat'),
    ('taufiq', 'MUHAMMAD TAUFIQ HIDAYAT, S.P., M.M.', 'Muhammad Taufiq Hidayat', 'Perben'),
    ('dindin', 'DINDIN MAHPUDIN, SE., Ak., M.Ak., CA., AAP., ACPA', 'Dindin Mahpudin', 'Aklap'),
    ('andri', 'ANDRI PRAMANA, S.STP.', 'Andri Pramana', 'Anggaran'),
    ('novi', 'NOVI RAHYANTI,SE., MAcctFin', 'Novi Rahyanti', 'BMD'),
    ('agus', 'AGUS JONI LISTIAJDI, ST', 'Agus Joni Listiajdi', 'UPTD'),
]


def sen(value):
    if value is None:
        return None
    return int((Decimal(str(value)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def main():
    before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    wb = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
    targets, names = [], {}
    for row_number, row in enumerate(wb['PAGU SIRUP 2026_Perubahan'].iter_rows(values_only=True), 1):
        name, code, budget, owner = row[:4]
        code = str(code or '').strip()
        if re.fullmatch(r'\d\.\d{2}\.\d{2}\.\d\.\d{2}', code):
            names[code] = str(name).strip()
        if not re.fullmatch(r'\d\.\d{2}\.\d{2}\.\d\.\d{2}\.\d{4}', code):
            continue
        ppk = next((p for p in PPKS if p[1] == str(owner).strip()), None)
        if not ppk:
            raise ValueError(f'PPK tidak dikenali pada baris {row_number}')
        if code == '5.02.01.1.02.0001':
            continue
        targets.append({'ppk': ppk[0], 'code': code, 'name': str(name).strip(),
                        'budget': sen(budget), 'activityName': names.get('.'.join(code.split('.')[:5]), ''),
                        'sourceRow': row_number})
    comparisons = []
    for p in PPKS:
        for row in wb[p[3]].iter_rows(values_only=True):
            code = str(row[1] or '').strip()
            if re.fullmatch(r'\d\.\d{2}\.\d{2}\.\d\.\d{2}', code):
                comparisons.append({'ppk': p[0], 'code': code, 'budget': sen(row[2]), 'input': sen(row[3])})
    wb.close()
    assert before == hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'Source changed'
    assert len({(t['ppk'], t['code']) for t in targets}) == len(targets)
    assert sum(t['budget'] or 0 for t in targets if t['ppk'] == 'siti') == 721116902623
    out = {'year': 2026, 'source': SOURCE.name, 'sourceSha256': before, 'unit': 'sen',
           'ppks': [dict(zip(['id', 'name', 'shortName', 'bidang'], p)) for p in PPKS],
           'targets': targets, 'excelComparisons': comparisons}
    (ROOT / 'data').mkdir(exist_ok=True)
    (ROOT / 'data' / 'pagu.json').write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f'Imported {len(targets)} subkegiatan, {len(PPKS)} PPK. Source SHA256 unchanged: {before}')


if __name__ == '__main__':
    main()
