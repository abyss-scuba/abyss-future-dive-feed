/**
 * Read a query parameter without converting literal plus signs to spaces.
 * This matters because a standard Base64 value may contain "+".
 */
export function readRawQueryParam(urlText, parameterName) {
  const text = String(urlText || "");
  const queryIndex = text.indexOf("?");
  if (queryIndex === -1) return null;

  const fragmentIndex = text.indexOf("#", queryIndex);
  const query = text.slice(
    queryIndex + 1,
    fragmentIndex === -1 ? undefined : fragmentIndex
  );

  const escapedName = parameterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = query.match(new RegExp(`(?:^|&)${escapedName}=([^&]*)`));
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function decodeBase64Utf8(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");

  const decoded = Buffer.from(normalized, "base64").toString("utf8");
  if (!decoded || /\uFFFD/.test(decoded)) {
    throw new Error("Booking code did not decode as UTF-8");
  }
  return decoded;
}

/**
 * Preserve the exact DS360 URL while decoding q metadata for identity,
 * title extraction and validation.
 */
export function decodeBookingUrl(href, baseUrl = "https://www.abyss.com.au") {
  if (!href) {
    return {
      bookingUrl: null,
      bookingCode: null,
      decodedBookingCode: null,
      partNumber: null,
      openCartId: null,
      bookingDate: null,
      decodeError: null
    };
  }

  let bookingUrl;
  try {
    bookingUrl = new URL(href, baseUrl).href;
  } catch (error) {
    return {
      bookingUrl: String(href),
      bookingCode: null,
      decodedBookingCode: null,
      partNumber: null,
      openCartId: null,
      bookingDate: null,
      decodeError: `Invalid booking URL: ${error.message}`
    };
  }

  const bookingCode = readRawQueryParam(bookingUrl, "q");
  if (!bookingCode) {
    return {
      bookingUrl,
      bookingCode: null,
      decodedBookingCode: null,
      partNumber: null,
      openCartId: null,
      bookingDate: null,
      decodeError: null
    };
  }

  try {
    const decodedBookingCode = decodeBase64Utf8(bookingCode);
    const decodedParams = new URLSearchParams(decodedBookingCode);

    return {
      bookingUrl,
      bookingCode,
      decodedBookingCode,
      partNumber: decodedParams.get("part_number"),
      openCartId: decodedParams.get("open_cart_id"),
      bookingDate: decodedParams.get("date"),
      decodeError: null
    };
  } catch (error) {
    return {
      bookingUrl,
      bookingCode,
      decodedBookingCode: null,
      partNumber: null,
      openCartId: null,
      bookingDate: null,
      decodeError: error.message
    };
  }
}

export function stripTrailingDate(value) {
  return String(value || "")
    .replace(
      /\s+(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s*$/,
      ""
    )
    .trim();
}
