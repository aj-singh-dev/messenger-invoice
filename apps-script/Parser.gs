function parseInvoiceRequest(text, referenceDate) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw new Error('Message was empty.');
  }

  const invoiceNumber = extractInvoiceNumber(normalized);
  const rosterInvoice = parseRosterInvoiceRequest(normalized, referenceDate);

  if (rosterInvoice) {
    rosterInvoice.invoiceNumber = invoiceNumber;
    return rosterInvoice;
  }

  const dateRange = extractDateRange(normalized);
  const workedDays = extractWorkedDays(normalized);

  if (!dateRange.startDate || !dateRange.endDate) {
    throw new Error('Could not find a valid date range or dated roster lines.');
  }

  validateInvoiceDatesAndDays(dateRange.startDate, dateRange.endDate, workedDays);

  return {
    invoiceNumber: invoiceNumber,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    workedDays: workedDays
  };
}

function parseRosterInvoiceRequest(text, referenceDate) {
  const entries = extractRosterEntries(text, referenceDate || new Date());
  if (entries.length === 0) {
    return null;
  }

  entries.sort(function(a, b) {
    return a.date.getTime() - b.date.getTime();
  });

  const startDate = entries[0].date;
  const endDate = entries[entries.length - 1].date;
  const workedByDay = {};

  entries.forEach(function(entry) {
    if (entry.worked) {
      workedByDay[dayKeyForDate(entry.date)] = true;
    }
  });

  const workedDays = DAY_ORDER.filter(function(day) {
    return Boolean(workedByDay[day]);
  });

  validateInvoiceDatesAndDays(startDate, endDate, workedDays);

  return {
    invoiceNumber: null,
    startDate: startDate,
    endDate: endDate,
    workedDays: workedDays,
    rosterEntries: entries
  };
}

function extractRosterEntries(text, referenceDate) {
  const entries = [];
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach(function(line) {
    const match = line.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(.+)$/);
    if (!match) {
      return;
    }

    const date = parseRosterDate(match[1], match[2], match[3], referenceDate);
    const status = match[4].trim();
    entries.push({
      date: date,
      rawStatus: status,
      worked: isWorkedRosterStatus(status)
    });
  });

  return entries;
}

function parseRosterDate(dayValue, monthValue, yearValue, referenceDate) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  let year;

  if (yearValue) {
    year = Number(yearValue);
    if (year < 100) {
      year += 2000;
    }
  } else {
    year = referenceDate.getFullYear();
  }

  return createDate(year, month, day);
}

function isWorkedRosterStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized || /^off\b/.test(normalized)) {
    return false;
  }

  return /^\d{1,2}\s*:{1,2}\s*\d{2}\b/.test(normalized);
}

function validateInvoiceDatesAndDays(startDate, endDate, workedDays) {
  if (workedDays.length === 0) {
    throw new Error('Could not find worked days. Use roster lines like: 20/05 10:00.');
  }

  if (endDate.getTime() < startDate.getTime()) {
    throw new Error('End date cannot be before start date.');
  }
}

function extractInvoiceNumber(text) {
  const match = text.match(/\binvoice\s*(?:number|no\.?|#)?\s*[:#-]?\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function extractDateRange(text) {
  const isoRange = text.match(/\b(\d{4}-\d{2}-\d{2})\b\s*(?:to|-|until|through)\s*\b(\d{4}-\d{2}-\d{2})\b/i);
  if (isoRange) {
    return {
      startDate: parseIsoDate(isoRange[1]),
      endDate: parseIsoDate(isoRange[2])
    };
  }

  const slashRange = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b\s*(?:to|-|until|through)\s*\b(\d{1,2}\/\d{1,2}\/\d{4})\b/i);
  if (slashRange) {
    return {
      startDate: parseUkSlashDate(slashRange[1]),
      endDate: parseUkSlashDate(slashRange[2])
    };
  }

  return { startDate: null, endDate: null };
}

function extractWorkedDays(text) {
  const workedLine = text.match(/(?:worked|days|weekdays|shifts)\s*[:=-]?\s*([^\n]+)/i);
  const source = workedLine ? workedLine[1] : text;
  const found = {};

  source
    .toLowerCase()
    .replace(/[,/&+]/g, ' ')
    .split(/\s+/)
    .forEach(function(token) {
      const cleanToken = token.replace(/[^a-z]/g, '');
      const day = DAY_ALIASES[cleanToken];
      if (day) {
        found[day] = true;
      }
    });

  return DAY_ORDER.filter(function(day) {
    return Boolean(found[day]);
  });
}

function parseIsoDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('Invalid ISO date: ' + value);
  }

  return createDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseUkSlashDate(value) {
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error('Invalid UK date: ' + value);
  }

  return createDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function createDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Invalid date: ' + [year, month, day].join('-'));
  }

  return date;
}

function dayKeyForDate(date) {
  return DAY_ORDER[date.getDay() === 0 ? 6 : date.getDay() - 1];
}
