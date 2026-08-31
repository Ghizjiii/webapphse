import assert from 'node:assert/strict';

const trustedBeneficiaries = [
  {
    name: 'ТОО "HSE Company"',
    bin: '211040027532',
    accounts: [
      'KZ30601A871001584291',
      'KZ73601A871003898131',
      'KZ09601A871002455341',
      'KZ26601A871041267451',
      'KZ64601A871013330961',
      'KZ82601A871040285191',
    ],
  },
  {
    name: 'ТОО "HSE Engineering"',
    bin: '160440025655',
    accounts: ['KZ966017161000000922'],
  },
  {
    name: 'ТОО "Safety construction"',
    bin: '201140011964',
    accounts: [
      'KZ67601A871016447711',
      'KZ18601A871019926431',
      'KZ29601A871060679231',
    ],
  },
  {
    name: 'ТОО "Safety Education Group"',
    bin: '251240022279',
    accounts: ['KZ97722S000050501340'],
  },
];

function normalizeBin(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function normalizeIban(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function validate(bin, account) {
  const normalizedBin = normalizeBin(bin);
  const normalizedAccount = normalizeIban(account);
  const matched = trustedBeneficiaries.find(item => (
    item.bin === normalizedBin && item.accounts.includes(normalizedAccount)
  ));
  return {
    valid: Boolean(matched),
    name: matched?.name || '',
    bin: normalizedBin,
    account: normalizedAccount,
    binMatched: trustedBeneficiaries.some(item => item.bin === normalizedBin),
    accountMatched: trustedBeneficiaries.some(item => item.accounts.includes(normalizedAccount)),
  };
}

const cases = [
  ['HSE Company primary account', '211040027532', 'KZ30601A871001584291', true],
  ['HSE Company sixth account', '211040027532', 'KZ82601A871040285191', true],
  ['Safety construction first account', '201140011964', 'KZ67601A871016447711', true],
  ['Safety construction third account', '201140011964', 'KZ29601A871060679231', true],
  ['HSE Engineering spaced requisites', '160 440 025 655', 'KZ96 6017 1610 0000 0922', true],
  ['Mixed company BIN and account', '201140011964', 'KZ97722S000050501340', false],
  ['OCR I instead of 1 before correction', '201140011964', 'KZ67601A8710164477I1', false],
  ['Manual correction accepted', '201140011964', 'KZ67601A871016447711', true],
  ['Unknown manual IBAN', '211040027532', 'KZ00000A000000000000', false],
];

for (const [name, bin, account, expected] of cases) {
  const result = validate(bin, account);
  assert.equal(result.valid, expected, name);
}

console.log(`Payment beneficiary validation: ${cases.length} cases passed`);
