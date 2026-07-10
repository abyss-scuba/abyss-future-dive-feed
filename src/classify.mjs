function contains(text, pattern) {
  return pattern.test(text);
}

export function classifyEvent(event, sourceMeta) {
  const productPath = String(event.productPath || "").toLowerCase();
  const text = [
    event.charter,
    event.title,
    event.description,
    event.partNumber,
    productPath
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tags = new Set();
  let primaryCategory = sourceMeta.category || "dive";

  const isSeal = contains(text, /\bseal(?:s|\s+diving|\s+dive)?\b/);
  const isSnorkel = contains(text, /snorkel(?:ling|ing)?/);
  const isFreedive = contains(text, /free\s?div(?:e|ing)/);
  const isShore =
    sourceMeta.source === "guided-shore" ||
    contains(text, /guided shore|shore dive|marine marvel/);
  const isBoat =
    sourceMeta.source === "boat-seal" ||
    contains(text, /boat dive|double boat|single boat|charter/);

  if (isSnorkel) {
    primaryCategory = "snorkelling";
    tags.add("snorkelling");
    tags.add("marine-life");
  } else if (isFreedive) {
    primaryCategory = "freediving";
    tags.add("freediving");
    tags.add("marine-life");
  } else if (isSeal) {
    primaryCategory = "seal";
    tags.add("seal");
    tags.add("boat");
    tags.add("marine-life");
  } else if (isShore) {
    primaryCategory = "shore";
    tags.add("shore");
  } else if (isBoat) {
    primaryCategory = "boat";
    tags.add("boat");
  }

  if (contains(text, /shark|grey nurse|gray nurse/)) {
    tags.add("shark");
    tags.add("marine-life");
  }
  if (contains(text, /sea\s?dragon|marine marvel|octopus|ray\b|whale/)) {
    tags.add("marine-life");
  }
  if (contains(text, /\bclub\b/)) tags.add("club");
  if (contains(text, /\bnight\b/)) tags.add("night");
  if (contains(text, /\bwreck\b/)) tags.add("wreck");
  if (sourceMeta.source === "marine-special") tags.add("special-source");

  if (!tags.size && primaryCategory) tags.add(primaryCategory);

  return {
    primaryCategory,
    tags: [...tags].sort()
  };
}

export function sourceSpecificity(source) {
  switch (source) {
    case "marine-special":
      return 30;
    case "guided-shore":
      return 20;
    case "boat-seal":
      return 20;
    default:
      return 10;
  }
}
