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

const callbackCases = [
  {
    name: 'Telegram callback query',
    payload: {
      update_id: 125,
      callback_query: {
        id: 'callback-1',
        from: { id: 101112 },
        data: 'review_create|abcdef',
        message: {
          message_id: 458,
          chat: { id: -100123 }
        }
      }
    },
    expected: {
      id: '125:callback-1',
      callbackQueryId: 'callback-1',
      from: '101112',
      chatId: '-100123',
      messageId: 458,
      data: 'review_create|abcdef'
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

callbackCases.forEach((testCase) => {
  try {
    const callbackQuery = context.extractTelegramCallbackQuery(testCase.payload);
    const actual = {
      id: callbackQuery.id,
      callbackQueryId: callbackQuery.callbackQueryId,
      from: callbackQuery.from,
      chatId: callbackQuery.chatId,
      messageId: callbackQuery.messageId,
      data: callbackQuery.data
    };

    assertDeepEqual(testCase.name, actual, testCase.expected);
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error.stack || error.message || error);
  }
});

testInvoiceReviewMessage();
testInvoiceReviewKeyboard();
testInvoiceReviewDayUpdate();
testInvoiceReviewInvoiceNumberUpdate();
testInvoiceReviewPendingInvoiceNumberRouting();
testInvoiceReviewWeekShift();
testEmailMessageBuild();
testManualEmailPdfUrl();
testEmailOptionsEnabled();
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

  const renumberPreview = {
    invoiceNumber: 9,
    manualInvoiceNumber: true,
    startDate: new Date(2026, 4, 18),
    endDate: new Date(2026, 4, 24),
    workedDays: ['thu']
  };
  context.previewInvoiceNumber(fakeSpreadsheet, renumberPreview);
  assertDeepEqual('Index previews manual renumber for same period', {
    invoiceNumber: renumberPreview.invoiceNumber,
    indexRow: renumberPreview.indexRow,
    indexRows: indexRows.slice(1).map(summarizeIndexRow)
  }, {
    invoiceNumber: 9,
    indexRow: 2,
    indexRows: [
      ['2026-05-18', '2026-05-24', 4]
    ]
  });

  const renumber = {
    invoiceNumber: 9,
    manualInvoiceNumber: true,
    startDate: new Date(2026, 4, 18),
    endDate: new Date(2026, 4, 24),
    workedDays: ['thu']
  };
  context.resolveInvoiceNumber(fakeSpreadsheet, renumber);
  assertDeepEqual('Index allows manual renumber for same period', {
    invoiceNumber: renumber.invoiceNumber,
    indexRows: indexRows.slice(1).map(summarizeIndexRow),
    lastInvoiceNumber
  }, {
    invoiceNumber: 9,
    indexRows: [
      ['2026-05-18', '2026-05-24', 9]
    ],
    lastInvoiceNumber: 9
  });

  const next = {
    invoiceNumber: null,
    startDate: new Date(2026, 4, 25),
    endDate: new Date(2026, 4, 31),
    workedDays: ['mon']
  };
  const nextPreview = {
    invoiceNumber: null,
    startDate: new Date(2026, 4, 25),
    endDate: new Date(2026, 4, 31),
    workedDays: ['mon']
  };
  context.previewInvoiceNumber(fakeSpreadsheet, nextPreview);
  assertDeepEqual('Index previews next invoice without reserving', {
    invoiceNumber: nextPreview.invoiceNumber,
    generatedInvoiceNumber: nextPreview.generatedInvoiceNumber,
    indexRows: indexRows.length,
    lastInvoiceNumber
  }, {
    invoiceNumber: 10,
    generatedInvoiceNumber: true,
    indexRows: 2,
    lastInvoiceNumber: 9
  });

  context.resolveInvoiceNumber(fakeSpreadsheet, next);
  assertDeepEqual('Index reserves next invoice for later week', {
    invoiceNumber: next.invoiceNumber,
    lastInvoiceNumber
  }, {
    invoiceNumber: 10,
    lastInvoiceNumber: 10
  });

  const duplicate = {
    invoiceNumber: 9,
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
    invoiceNumber: 11,
    lastInvoiceNumber: 11
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

function testInvoiceReviewMessage() {
  const previousGetOptionalProperty = context.getOptionalProperty;
  const previousSession = context.Session;
  const previousUtilities = context.Utilities;

  context.getOptionalProperty = (key) => {
    if (key === 'WEEKDAY_RATE') {
      return '37';
    }
    if (key === 'WEEKEND_RATE') {
      return '40';
    }
    return '';
  };
  context.Session = {
    getScriptTimeZone() {
      return 'Europe/London';
    }
  };
  context.Utilities = {
    formatDate(date, timezone, format) {
      if (format === 'd') {
        return String(date.getDate());
      }
      if (format === 'd MMMM yyyy') {
        return `${date.getDate()} ${monthName(date)} ${date.getFullYear()}`;
      }
      if (format === 'd MMMM') {
        return `${date.getDate()} ${monthName(date)}`;
      }
      return toIsoDate(date);
    }
  };

  try {
    const invoice = context.parseInvoiceRequest(
      'Invoice 17\n24/08 OFF\n25/08 PFE\n26/08 05:00\n30/08 09:00 75',
      new Date(2026, 7, 31)
    );
    const message = context.buildInvoiceReviewMessage(invoice);

    assertContains('Review message includes invoice number', message, 'Invoice: 17');
    assertContains('Review message includes uncertain status', message, 'Tuesday: PFE - £37 - please check');
    assertContains('Review message includes amount override', message, 'Sunday: 09:00 - £75');
    assertContains('Review message includes total', message, 'Total: £149');
    console.log('ok - Invoice review message');
  } finally {
    context.getOptionalProperty = previousGetOptionalProperty;
    context.Session = previousSession;
    context.Utilities = previousUtilities;
  }
}

function testInvoiceReviewKeyboard() {
  assertDeepEqual('Invoice review main keyboard', context.buildInvoiceReviewKeyboard('token'), [
    [{ text: 'Cancel', callback_data: 'review_cancel|token' }],
    [{ text: 'Change', callback_data: 'review_change|token' }],
    [{ text: 'Create PDF', callback_data: 'review_create|token' }]
  ]);

  assertDeepEqual('Invoice review change keyboard', context.buildInvoiceReviewChangeKeyboard('token'), [
    [{ text: 'Change day', callback_data: 'review_edit_day|token' }],
    [{ text: 'Invoice number', callback_data: 'review_edit_invoice|token' }],
    [{ text: 'Back', callback_data: 'review_back|token' }],
    [{ text: 'Cancel', callback_data: 'review_cancel|token' }]
  ]);

  console.log('ok - Invoice review keyboard');
}

function testInvoiceReviewDayUpdate() {
  const invoice = context.parseInvoiceRequest(
    'Invoice 17\n24/08 OFF\n25/08 05:00\n26/08 05:00',
    new Date(2026, 7, 31)
  );

  context.updateInvoiceReviewDay(invoice, 'sun', '75');
  const sunday = invoice.rosterEntries.find((entry) => entry.weekday === 'sun');

  assertDeepEqual('Review day amount edit', {
    workedDays: invoice.workedDays,
    sunday: {
      date: toIsoDate(sunday.date),
      rawStatus: sunday.rawStatus,
      worked: sunday.worked,
      shiftTime: sunday.shiftTime,
      amountOverride: sunday.amountOverride,
      uncertain: sunday.uncertain
    }
  }, {
    workedDays: ['tue', 'wed', 'sun'],
    sunday: {
      date: '2026-08-30',
      rawStatus: 'worked',
      worked: true,
      shiftTime: '',
      amountOverride: 75,
      uncertain: false
    }
  });

  context.updateInvoiceReviewDay(invoice, 'tue', 'OFF');
  assertDeepEqual('Review day off edit', invoice.workedDays, ['wed', 'sun']);

  console.log('ok - Invoice review day update');
}

function testInvoiceReviewInvoiceNumberUpdate() {
  const indexRows = [[
    'Period Start',
    'Period End',
    'Invoice Number',
    'Drive File ID',
    'Drive Filename',
    'Created At',
    'Updated At'
  ]];
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
  const previousOpenInvoiceSpreadsheet = context.openInvoiceSpreadsheet;

  context.openInvoiceSpreadsheet = () => fakeSpreadsheet;

  try {
    const invoice = context.parseInvoiceRequest(
      '24/08 OFF\n25/08 05:00\n26/08 05:00',
      new Date(2026, 7, 31)
    );
    invoice.invoiceNumber = 17;
    invoice.generatedInvoiceNumber = true;

    const changed = context.updateInvoiceReviewInvoiceNumber(invoice, '18');
    assertDeepEqual('Review invoice number edit', {
      invoiceNumber: invoice.invoiceNumber,
      generatedInvoiceNumber: invoice.generatedInvoiceNumber,
      manualInvoiceNumber: invoice.manualInvoiceNumber,
      changed
    }, {
      invoiceNumber: 18,
      generatedInvoiceNumber: false,
      manualInvoiceNumber: true,
      changed: true
    });

    const unchanged = context.updateInvoiceReviewInvoiceNumber(invoice, '18');
    assertDeepEqual('Review same invoice number edit', {
      invoiceNumber: invoice.invoiceNumber,
      unchanged
    }, {
      invoiceNumber: 18,
      unchanged: false
    });

    console.log('ok - Invoice review invoice number update');
  } finally {
    context.openInvoiceSpreadsheet = previousOpenInvoiceSpreadsheet;
  }
}

function testInvoiceReviewPendingInvoiceNumberRouting() {
  assertDeepEqual('Invoice number reply detection', {
    number: context.isInvoiceReviewInvoiceNumberReply('18'),
    invoiceMessage: context.isInvoiceReviewInvoiceNumberReply('Invoice 18\n24/08 OFF')
  }, {
    number: true,
    invoiceMessage: false
  });

  assertDeepEqual('New invoice request detection', {
    rota: context.isLikelyNewInvoiceRequestMessage('Invoice 18\n24/08 OFF\n25/08 05:00'),
    plainText: context.isLikelyNewInvoiceRequestMessage('please use the same one')
  }, {
    rota: true,
    plainText: false
  });

  console.log('ok - Invoice review pending invoice number routing');
}

function testInvoiceReviewWeekShift() {
  const invoice = context.parseInvoiceRequest(
    '24/08 OFF\n25/08 05:00\n30/08 09:00',
    new Date(2026, 7, 31)
  );
  invoice.invoiceNumber = 17;
  invoice.generatedInvoiceNumber = true;
  invoice.manualInvoiceNumber = false;
  invoice.indexRow = 12;
  invoice.driveFileId = 'file-id';
  invoice.driveFilename = 'invoice.pdf';

  context.shiftInvoiceReviewWeek(invoice, 7);

  assertDeepEqual('Review week shift', {
    invoiceNumber: invoice.invoiceNumber,
    generatedInvoiceNumber: invoice.generatedInvoiceNumber,
    manualInvoiceNumber: invoice.manualInvoiceNumber,
    startDate: toIsoDate(invoice.startDate),
    endDate: toIsoDate(invoice.endDate),
    workedDays: invoice.workedDays,
    firstEntryDate: toIsoDate(invoice.rosterEntries[0].date),
    indexRow: invoice.indexRow,
    driveFileId: invoice.driveFileId,
    driveFilename: invoice.driveFilename
  }, {
    invoiceNumber: null,
    generatedInvoiceNumber: true,
    manualInvoiceNumber: false,
    startDate: '2026-08-31',
    endDate: '2026-09-06',
    workedDays: ['tue', 'sun'],
    firstEntryDate: '2026-08-31',
    indexRow: null,
    driveFileId: '',
    driveFilename: ''
  });

  invoice.invoiceNumber = 19;
  invoice.generatedInvoiceNumber = false;
  invoice.manualInvoiceNumber = false;
  context.shiftInvoiceReviewWeek(invoice, 7);
  assertDeepEqual('Generated review week shift clears previously previewed existing number', {
    invoiceNumber: invoice.invoiceNumber,
    manualInvoiceNumber: invoice.manualInvoiceNumber
  }, {
    invoiceNumber: null,
    manualInvoiceNumber: false
  });

  console.log('ok - Invoice review week shift');
}

function testEmailMessageBuild() {
  const previousGetOptionalProperty = context.getOptionalProperty;
  context.getOptionalProperty = (key) => key === 'EMAIL_SENDER_NAME' ? 'Invoice Sender' : '';

  try {
    const file = {
      getBlob() {
        return {
          setName(name) {
            return { name };
          }
        };
      }
    };
    const entry = {
      invoiceNumber: 17,
      startDate: new Date(2026, 7, 24),
      endDate: new Date(2026, 7, 30)
    };
    const message = context.buildEmailMessage(
      ['first@example.com', 'second@example.com'],
      entry,
      file,
      '2026-08-24 - Invoice 17.pdf'
    );

    assertDeepEqual('Email message build', {
      to: message.to,
      subject: message.subject,
      hasAttachment: message.attachments.length === 1,
      attachmentName: message.attachments[0].name,
      name: message.name
    }, {
      to: 'first@example.com,second@example.com',
      subject: 'Invoice 17 - 2026-08-24 to 2026-08-30',
      hasAttachment: true,
      attachmentName: '2026-08-24 - Invoice 17.pdf',
      name: 'Invoice Sender'
    });

    console.log('ok - Email message build');
  } finally {
    context.getOptionalProperty = previousGetOptionalProperty;
  }
}

function testManualEmailPdfUrl() {
  const previousGetOptionalProperty = context.getOptionalProperty;
  const previousDriveApp = context.DriveApp;
  let shared = false;

  const file = {
    setSharing(access, permission) {
      shared = access === 'anyone' && permission === 'view';
    },
    getUrl() {
      return 'https://drive.google.com/file/d/test/view';
    }
  };

  context.DriveApp = {
    Access: {
      ANYONE_WITH_LINK: 'anyone'
    },
    Permission: {
      VIEW: 'view'
    }
  };

  try {
    context.getOptionalProperty = () => '';
    assertDeepEqual('Manual email PDF URL disabled', {
      url: context.prepareManualEmailPdfUrl(file),
      shared: shared
    }, {
      url: '',
      shared: false
    });

    context.getOptionalProperty = (key) => key === 'EMAIL_MANUAL_DRIVE_LINK_ENABLED' ? 'true' : '';
    assertDeepEqual('Manual email PDF URL enabled', {
      url: context.prepareManualEmailPdfUrl(file),
      shared: shared
    }, {
      url: 'https://drive.google.com/file/d/test/view',
      shared: true
    });

    console.log('ok - Manual email PDF URL');
  } finally {
    context.getOptionalProperty = previousGetOptionalProperty;
    context.DriveApp = previousDriveApp;
  }
}

function testEmailOptionsEnabled() {
  const previousGetOptionalProperty = context.getOptionalProperty;

  try {
    context.getOptionalProperty = () => '';
    assertDeepEqual('Email options disabled by default', context.areEmailOptionsEnabled(), false);

    context.getOptionalProperty = (key) => key === 'EMAIL_OPTIONS_ENABLED' ? 'true' : '';
    assertDeepEqual('Email options enabled by property', context.areEmailOptionsEnabled(), true);

    console.log('ok - Email options enabled flag');
  } finally {
    context.getOptionalProperty = previousGetOptionalProperty;
  }
}

function monthName(date) {
  return [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ][date.getMonth()];
}

function assertContains(name, haystack, needle) {
  if (String(haystack).indexOf(needle) === -1) {
    throw new Error(`${name} missing ${JSON.stringify(needle)} in:\n${haystack}`);
  }
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
