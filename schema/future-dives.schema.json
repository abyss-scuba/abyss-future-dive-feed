{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://www.abyss.com.au/schemas/future-dives.schema.json",
  "title": "Abyss future dive feed",
  "type": "object",
  "required": [
    "schemaVersion",
    "generatedAt",
    "timezone",
    "window",
    "sources",
    "eventCount",
    "events"
  ],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "generatedAt": { "type": "string", "format": "date-time" },
    "timezone": { "const": "Australia/Sydney" },
    "futureStartOffsetDays": { "type": "integer", "minimum": 0 },
    "publicHorizonDays": { "type": "integer", "minimum": 1 },
    "collectionTargetDays": { "type": "integer", "minimum": 1 },
    "window": {
      "type": "object",
      "required": ["startsOn", "publicSearchThrough", "publicTargetThrough"],
      "properties": {
        "startsOn": { "type": "string", "format": "date" },
        "publicSearchThrough": {
          "type": ["string", "null"],
          "format": "date"
        },
        "publicTargetThrough": { "type": "string", "format": "date" },
        "collectedThrough": { "type": "string", "format": "date" }
      }
    },
    "sources": { "type": "object" },
    "eventCount": { "type": "integer", "minimum": 0 },
    "events": {
      "type": "array",
      "items": { "$ref": "#/$defs/event" }
    }
  },
  "$defs": {
    "event": {
      "type": "object",
      "required": [
        "id",
        "source",
        "sourceWidgetId",
        "primaryCategory",
        "title",
        "startDate",
        "price",
        "bookingUrl",
        "bookingCode",
        "productPath"
      ],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "openCartId": { "type": ["string", "null"] },
        "source": { "type": "string" },
        "sourceWidgetId": { "type": "string" },
        "primaryCategory": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "title": { "type": "string", "minLength": 1 },
        "startDate": { "type": "string", "format": "date" },
        "startTime": {
          "type": ["string", "null"],
          "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
        },
        "price": {
          "type": "object",
          "required": ["amount", "currency", "display"],
          "properties": {
            "amount": { "type": "number", "minimum": 0 },
            "currency": { "const": "AUD" },
            "display": { "type": "string" }
          }
        },
        "bookingUrl": {
          "type": "string",
          "format": "uri",
          "pattern": "\\?q="
        },
        "bookingCode": { "type": "string", "minLength": 1 },
        "productPath": { "type": "string", "pattern": "^/" }
      }
    }
  }
}
