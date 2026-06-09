import json, openpyxl
wb = openpyxl.load_workbook('SampleLibrary_Data.xlsx', data_only=True)
ws = wb.active
headers = [cell.value for cell in ws[1]]
rows = []
for row_idx in range(2, ws.max_row + 1):
    row_data = {}
    for col_idx in range(ws.max_column):
        val = ws.cell(row=row_idx, column=col_idx+1).value
        if isinstance(val, (int, float)):
            row_data[headers[col_idx]] = str(val) if val else ''
        elif val is None:
            row_data[headers[col_idx]] = ''
        else:
            row_data[headers[col_idx]] = str(val).strip()
    rows.append(row_data)

with open('scripts/sample_library_data.json', 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)
print(f'Wrote {len(rows)} rows to scripts/sample_library_data.json')