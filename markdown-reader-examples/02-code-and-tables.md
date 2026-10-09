# Garden records: code and tables

Technical notes often place short explanations beside code and structured data. Wide content should stay within its own scrolling area so the prose remains readable.

This file uses small, fictional examples. The code is text for display, not a request to run commands or change a database.

## A weekly summary

| Area      | Planned work         | Recorded result                 |
| --------- | -------------------- | ------------------------------- |
| North bed | Add compost          | Four small buckets added        |
| South bed | Check seedlings      | Labels visible; soil damp       |
| Main path | Clear loose material | Swept before closing            |
| Tool shed | Check handles        | One trowel set aside for repair |

The table gives a compact summary. The notes below preserve the detail needed for the next session.

## JSON: keep the original layout

The source layout below is intentional. Highlighting should distinguish keys and values without reformatting the text.

```json
{
  "garden": "Willow",
  "session": 7,
  "beds": [
    { "id": "north", "watered": false },
    { "id": "south", "watered": true }
  ],
  "notes": null
}
```

## TypeScript: describe a record

```typescript
type GardenRecord = {
  bed: "north" | "south";
  task: string;
  buckets: number;
};

function describeRecord(record: GardenRecord): string {
  return `${record.bed}: ${record.task}, ${record.buckets} buckets`;
}
```

## JavaScript: calculate a total

```javascript
const records = [
  { bed: "north", buckets: 2 },
  { bed: "north", buckets: 2 },
];

const total = records.reduce((sum, record) => {
  return sum + record.buckets;
}, 0);

// Expected demonstration result: 4
```

## Shell: display text

```bash
# This example only prints a demonstration message.
printf '%s\n' 'Willow Garden: handover ready'
```

## Python: group records

```python
records = [
    {"bed": "north", "buckets": 2},
    {"bed": "north", "buckets": 2},
]

totals = {}
for record in records:
    bed = record["bed"]
    totals[bed] = totals.get(bed, 0) + record["buckets"]

print(totals)
```

## HTML and CSS: passive markup

Markup appears as code. It does not become an interactive page inside the document.

```html
<section class="garden-note">
  <h2>North bed</h2>
  <p>Four small buckets of compost added.</p>
</section>
```

```css
.garden-note {
  max-width: 60ch;
  padding: 1.5rem;
  border: 1px solid currentColor;
}

.garden-note h2 {
  margin-block-start: 0;
}
```

## A wide table

Scroll within this table to inspect later columns. The paragraph after it should stay within the reading column.

| Session   | Area      | Task                 | Start | Finish | Volunteers     | Buckets            | Watering cans  | Tool condition      | Path condition | Labels            | Next check                      |
| --------- | --------- | -------------------- | ----- | ------ | -------------- | ------------------ | -------------- | ------------------- | -------------- | ----------------- | ------------------------------- |
| Autumn 07 | North bed | Add finished compost | 09:00 | 09:40  | Two volunteers | Four small buckets | None needed    | Hand fork checked   | Clear and dry  | Both ends visible | Soil level at next session      |
| Autumn 07 | South bed | Inspect seedlings    | 09:15 | 09:30  | One volunteer  | None added         | One small can  | Rose attached       | Clear and dry  | Both ends visible | Soil moisture in afternoon      |
| Autumn 07 | Tool shed | Check shared tools   | 09:30 | 09:45  | One volunteer  | Not applicable     | Not applicable | One repair recorded | Entrance clear | Repair box marked | Handle replacement before reuse |

This paragraph is deliberately ordinary prose. A wide table should not force it beyond the reading column or make the entire file panel scroll sideways.

## A wide code line

```javascript
const handover =
  "North bed: four small buckets of finished compost added; south bed: soil checked; shared path: swept; tool shed: one damaged trowel placed in the repair box.";
```

## Unknown languages stay readable

This SQL fence is not one of the reader's bundled highlight languages. It should remain plain code rather than disappear or receive guessed highlighting.

```sql
SELECT bed, SUM(buckets) AS total_buckets
FROM garden_records
GROUP BY bed;
```

Compare the formatted document with Raw, then return to the [example index](README.md).
