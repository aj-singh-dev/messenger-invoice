const fs = require('fs');
const path = require('path');
const vm = require('vm');

const codePath = path.join(__dirname, '..', 'Code.gs');
const code = fs.readFileSync(codePath, 'utf8');

const context = {
  console,
  Date,
  Error,
  JSON,
  Number,
  Object,
  RegExp,
  String,
  Boolean
};

vm.createContext(context);
vm.runInContext(code, context, { filename: codePath });

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
    const parsed = context.parseInvoiceRequest(testCase.input);
    const actual = {
      invoiceNumber: parsed.invoiceNumber,
      startDate: toIsoDate(parsed.startDate),
      endDate: toIsoDate(parsed.endDate),
      workedDays: parsed.workedDays
    };

    assertDeepEqual(testCase.name, actual, testCase.expected);
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
