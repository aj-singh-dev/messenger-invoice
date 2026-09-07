const fs = require('fs');
const path = require('path');
const vm = require('vm');

const codeDir = path.join(__dirname, '..');
const code = fs.readdirSync(codeDir)
  .filter((file) => file.endsWith('.gs'))
  .sort()
  .map((file) => fs.readFileSync(path.join(codeDir, file), 'utf8'))
  .join('\n');

const context = {
  console,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  String,
  Boolean
};

vm.createContext(context);
vm.runInContext(code, context, { filename: 'apps-script/*.gs' });

const cases = [
  {
    name: 'MVP format',
    input: 'Invoice week 2026-05-11 to 2026-05-17\nWorked: Mon Tue Wed Thu Fri',
    expected: {
      invoiceNumber: null,
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      workedDays: ['mon', 'tue', 'wed', 'thu', 'fri']
    }
  },
  {
    name: 'With invoice number',
    input: 'Invoice 1042\nWeek 2026-05-11 to 2026-05-17\nWorked: Mon Wed Fri',
    expected: {
      invoiceNumber: 1042,
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      workedDays: ['mon', 'wed', 'fri']
    }
  },
  {
    name: 'UK slash dates',
    input: 'Invoice week 11/05/2026 to 17/05/2026\nWorked: Tuesday Thursday',
    expected: {
      invoiceNumber: null,
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      workedDays: ['tue', 'thu']
    }
  },
  {
    name: 'Comma-separated days',
    input: 'Week 2026-05-11 - 2026-05-17\nDays: monday, tues, weds, thurs, friday, saturday, sunday',
    expected: {
      invoiceNumber: null,
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      workedDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    }
  },
  {
    name: 'Weekend only',
    input: 'Invoice week 2026-05-16 to 2026-05-17\nWorked: Sat Sun',
    expected: {
      invoiceNumber: null,
      startDate: '2026-05-16',
      endDate: '2026-05-17',
      workedDays: ['sat', 'sun']
    }
  },
  {
    name: 'Roster format infers year and worked days',
    input: 'Hi ,\n18/05 OFF\n19/05 OFF\n20/05 10:00\n21/05 10:00\n22/05 11::00\n23/05 10:00\n24/05 11:00\nPLEASE CONFIRM',
    referenceDate: new Date(2026, 4, 30),
    expected: {
      invoiceNumber: null,
      startDate: '2026-05-18',
      endDate: '2026-05-24',
      workedDays: ['wed', 'thu', 'fri', 'sat', 'sun']
    }
  },
  {
    name: 'Roster format with explicit invoice number',
    input: 'Invoice 4\n18/05 OFF\n19/05 OFF\n20/05 10:00',
    referenceDate: new Date(2026, 4, 30),
    expected: {
      invoiceNumber: 4,
      startDate: '2026-05-18',
      endDate: '2026-05-24',
      workedDays: ['wed']
    }
  },
  {
    name: 'Roster date after invoice text on same line',
    input: 'Invoice 8 8/06 OFF\n9/06 05:00\n10/06 05:00\n14/06 05:00',
    referenceDate: new Date(2026, 5, 20),
    expected: {
      invoiceNumber: 8,
      startDate: '2026-06-08',
      endDate: '2026-06-14',
      workedDays: ['tue', 'wed', 'sun']
    }
  },
  {
    name: 'Invoice hash number',
    input: 'Invoice # 9\n8/06 OFF\n9/06 05:00',
    referenceDate: new Date(2026, 5, 20),
    expected: {
      invoiceNumber: 9,
      startDate: '2026-06-08',
      endDate: '2026-06-14',
      workedDays: ['tue']
    }
  },
  {
    name: 'Invoice pdf suffix number',
    input: 'Invoice  9 .pdf\n8/06 OFF\n9/06 05:00',
    referenceDate: new Date(2026, 5, 20),
    expected: {
      invoiceNumber: 9,
      startDate: '2026-06-08',
      endDate: '2026-06-14',
      workedDays: ['tue']
    }
  },
  {
    name: 'Missing OFF Monday still uses full week',
    input: '25/08 05:00\n26/08 05:00\n29/08 05:00',
    referenceDate: new Date(2026, 7, 31),
    expected: {
      invoiceNumber: null,
      startDate: '2026-08-24',
      endDate: '2026-08-30',
      workedDays: ['tue', 'wed', 'sat']
    }
  },
  {
    name: 'Unknown status is preserved for review',
    input: '24/08 OFF\n25/08 PFE\n26/08 05:00',
    referenceDate: new Date(2026, 7, 31),
    expected: {
      invoiceNumber: null,
      startDate: '2026-08-24',
      endDate: '2026-08-30',
      workedDays: ['tue', 'wed']
    },
    expectedRosterEntries: [
      { weekday: 'mon', rawStatus: 'OFF', worked: false, shiftTime: '', amountOverride: null, uncertain: false },
      { weekday: 'tue', rawStatus: 'PFE', worked: true, shiftTime: '', amountOverride: null, uncertain: true },
      { weekday: 'wed', rawStatus: '05:00', worked: true, shiftTime: '05:00', amountOverride: null, uncertain: false }
    ]
  },
  {
    name: 'Amount overrides are preserved',
    input: '24/08 05:00 £60\n30/08 09:00\nSunday 75',
    referenceDate: new Date(2026, 7, 31),
    expected: {
      invoiceNumber: null,
      startDate: '2026-08-24',
      endDate: '2026-08-30',
      workedDays: ['mon', 'sun']
    },
    expectedRosterEntries: [
      { weekday: 'mon', rawStatus: '05:00 £60', worked: true, shiftTime: '05:00', amountOverride: 60, uncertain: false },
      { weekday: 'sun', rawStatus: '09:00', worked: true, shiftTime: '09:00', amountOverride: 75, uncertain: false }
    ]
  },
  {
    name: 'Explicit year boundary dates',
    input: 'Invoice 20\n29/12/2026 05:00\n01/01/2027 05:00',
    referenceDate: new Date(2026, 11, 31),
    expected: {
      invoiceNumber: 20,
      startDate: '2026-12-28',
      endDate: '2027-01-03',
      workedDays: ['tue', 'fri']
    }
  }
];

const telegramCases = [
  {
    name: 'Telegram text message',
    payload: {
      update_id: 123,
      message: {
        message_id: 456,
        date: 1778496000,
        chat: { id: 789 },
        from: { id: 101112 },
        text: 'Invoice week 2026-05-11 to 2026-05-17\nWorked: Mon Tue Wed'
      }
    },
    expected: {
      id: '123:456',
      from: '101112',
      chatId: '789',
      text: 'Invoice week 2026-05-11 to 2026-05-17\nWorked: Mon Tue Wed'
    }
  },
  {
    name: 'Telegram caption message',
    payload: {
      update_id: 124,
      message: {
        message_id: 457,
        chat: { id: -100123 },
        caption: 'Invoice 1042\nWeek 2026-05-11 to 2026-05-17\nWorked: Sat Sun'
      }
    },
    expected: {
      id: '124:457',
      from: '',
      chatId: '-100123',
      text: 'Invoice 1042\nWeek 2026-05-11 to 2026-05-17\nWorked: Sat Sun'
    }
  }
];

let failures = 0;

cases.forEach((testCase) => {
  try {
    const parsed = context.parseInvoiceRequest(testCase.input, testCase.referenceDate);
    const actual = {
      invoiceNumber: parsed.invoiceNumber,
      startDate: toIsoDate(parsed.startDate),
      endDate: toIsoDate(parsed.endDate),
      workedDays: parsed.workedDays
    };

    assertDeepEqual(testCase.name, actual, testCase.expected);

    if (testCase.expectedRosterEntries) {
      assertDeepEqual(
        testCase.name + ' roster entries',
        parsed.rosterEntries.map((entry) => ({
          weekday: entry.weekday,
          rawStatus: entry.rawStatus,
          worked: entry.worked,
          shiftTime: entry.shiftTime,
          amountOverride: entry.amountOverride,
          uncertain: entry.uncertain
        })),
        testCase.expectedRosterEntries
      );
    }

    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error.stack || error.message || error);
  }
});

telegramCases.forEach((testCase) => {
  try {
    const message = context.extractTelegramMessage(testCase.payload);
    const actual = {
      id: message.id,
      from: message.from,
      chatId: message.chatId,
      text: message.text
    };

    assertDeepEqual(testCase.name, actual, testCase.expected);
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error.stack || error.message || error);
  }
});

testImmediateGenerationReadiness();
testInvoiceIndexResolution();

if (failures > 0) {
  process.exitCode = 1;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertDeepEqual(name, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${name} mismatch\nactual:   ${actualJson}\nexpected: ${expectedJson}`);
  }
}

function testInvoiceIndexResolution() {
  const indexRows = [];
  let lastInvoiceNumber = 4;
  const fakeSheet = createFakeIndexSheet(indexRows);
  const fakeSpreadsheet = {
    getSheetByName(name) {
      return name === 'Invoice Index' ? fakeSheet : null;
    },
    insertSheet(name) {
      if (name !== 'Invoice Index') {
        throw new Error('Unexpected sheet: ' + name);
      }
      return fakeSheet;
    }
  };

  context.LockService = {
    getScriptLock() {
      return {
        waitLock() {},
        releaseLock() {}
      };
    }
  };
  context.getRequiredProperty = (key) => {
    if (key === 'LAST_INVOICE_NUMBER') {
      return String(lastInvoiceNumber);
    }
    throw new Error('Unexpected required property: ' + key);
  };
  context.setScriptProperty = (key, value) => {
    if (key === 'LAST_INVOICE_NUMBER') {
      lastInvoiceNumber = Number(value);
      return;
    }
    throw new Error('Unexpected set property: ' + key);
  };

  const explicit = {
    invoiceNumber: 4,
    startDate: new Date(2026, 4, 18),
    endDate: new Date(2026, 4, 24),
    workedDays: ['wed']
  };
  context.resolveInvoiceNumber(fakeSpreadsheet, explicit);
  assertDeepEqual('Index records explicit invoice', indexRows.slice(1).map(summarizeIndexRow), [
    ['2026-05-18', '2026-05-24', 4]
  ]);

  const correction = {
    invoiceNumber: null,
    startDate: new Date(2026, 4, 18),
    endDate: new Date(2026, 4, 24),
    workedDays: ['thu']
  };
  context.resolveInvoiceNumber(fakeSpreadsheet, correction);
  assertDeepEqual('Index reuses invoice for correction', correction.invoiceNumber, 4);

  const conflict = {
    invoiceNumber: 9,
    startDate: new Date(2026, 4, 18),
    endDate: new Date(2026, 4, 24),
    workedDays: ['thu']
  };
  assertThrows('Index rejects explicit conflict for same period', () => {
    context.resolveInvoiceNumber(fakeSpreadsheet, conflict);
  }, 'INVOICE_NUMBER_CONFLICT');

  const next = {
    invoiceNumber: null,
    startDate: new Date(2026, 4, 25),
    endDate: new Date(2026, 4, 31),
    workedDays: ['mon']
  };
  context.resolveInvoiceNumber(fakeSpreadsheet, next);
  assertDeepEqual('Index reserves next invoice for later week', {
    invoiceNumber: next.invoiceNumber,
    lastInvoiceNumber
  }, {
    invoiceNumber: 5,
    lastInvoiceNumber: 5
  });

  const duplicate = {
    invoiceNumber: 4,
    startDate: new Date(2026, 5, 1),
    endDate: new Date(2026, 5, 7),
    workedDays: ['mon']
  };
  assertThrows('Index rejects duplicate invoice number across weeks', () => {
    context.resolveInvoiceNumber(fakeSpreadsheet, duplicate);
  }, 'DUPLICATE_INVOICE_NUMBER');

  const gap = {
    invoiceNumber: null,
    startDate: new Date(2026, 5, 8),
    endDate: new Date(2026, 5, 14),
    workedDays: ['mon']
  };
  context.resolveInvoiceNumber(fakeSpreadsheet, gap);
  assertDeepEqual('Index reserves from max index invoice number', {
    invoiceNumber: gap.invoiceNumber,
    lastInvoiceNumber
  }, {
    invoiceNumber: 6,
    lastInvoiceNumber: 6
  });

  console.log('ok - Invoice index resolution');
}

function assertThrows(name, fn, expectedCode) {
  try {
    fn();
  } catch (error) {
    if (error.code !== expectedCode) {
      throw new Error(`${name} expected ${expectedCode} but got ${error.code || error.message || error}`);
    }
    return;
  }

  throw new Error(`${name} did not throw`);
}

function testImmediateGenerationReadiness() {
  const parsed = context.parseInvoiceRequest(
    '24/08 OFF\n25/08 PFE\n26/08 05:00',
    new Date(2026, 7, 31)
  );

  context.assertInvoiceReadyForImmediateGeneration(parsed);

  console.log('ok - Immediate generation allows unknown roster status');
}

function createFakeIndexSheet(rows) {
  return {
    getLastRow() {
      return rows.length;
    },
    getLastColumn() {
      return rows.length > 0 ? rows[0].length : 0;
    },
    appendRow(row) {
      rows.push(row);
    },
    insertColumnsBefore(column, howMany) {
      rows.forEach((row) => {
        for (let index = 0; index < howMany; index += 1) {
          row.splice(column - 1, 0, '');
        }
      });
    },
    getRange(row, column, rowCount, columnCount) {
      const effectiveRowCount = rowCount || 1;
      const effectiveColumnCount = columnCount || 1;
      return {
        getValues() {
          return rows.slice(row - 1, row - 1 + effectiveRowCount).map((sourceRow) => {
            const values = [];
            for (let index = 0; index < effectiveColumnCount; index += 1) {
              values.push(sourceRow[column - 1 + index]);
            }
            return values;
          });
        },
        setValue(value) {
          while (!rows[row - 1]) {
            rows.push([]);
          }
          rows[row - 1][column - 1] = value;
        }
      };
    }
  };
}

function summarizeIndexRow(row) {
  return [toIsoDate(row[0]), toIsoDate(row[1]), row[2]];
}
