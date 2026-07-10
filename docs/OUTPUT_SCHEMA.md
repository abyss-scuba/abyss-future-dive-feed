# Public feed schema

`data/future-dives.json` contains:

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-07-10T12:00:00.000Z",
  "timezone": "Australia/Sydney",
  "futureStartOffsetDays": 21,
  "publicHorizonDays": 90,
  "collectionTargetDays": 100,
  "window": {
    "startsOn": "2026-07-31",
    "publicSearchThrough": "2026-10-08",
    "publicTargetThrough": "2026-10-08",
    "collectedThrough": "2026-10-18"
  },
  "sources": {},
  "eventCount": 1,
  "events": []
}
```

Each public event contains exact DS360 booking data:

```json
{
  "id": "66121878",
  "openCartId": "66121878",
  "source": "boat-seal",
  "sourceWidgetId": "4746",
  "primaryCategory": "seal",
  "tags": ["boat", "marine-life", "seal"],
  "title": "Martin Island Seals",
  "description": "Playful fur seals swirl around you.",
  "startDate": "2026-07-11",
  "startTime": "11:30",
  "start": "2026-07-11T11:30:00+10:00",
  "price": {
    "amount": 130,
    "currency": "AUD",
    "display": "$130.00"
  },
  "bookingUrl": "https://www.abyss.com.au/charters/scuba-dive-with-seals?q=...",
  "bookingCode": "...",
  "partNumber": "Martin Island Seals 11/7/2026",
  "productPath": "/charters/scuba-dive-with-seals"
}
```

The `availabilitySnapshot` object is retained for diagnostics. It must not be treated as live inventory on the public calendar.
