import { strict as assert } from 'assert';
import { test } from 'node:test';
import { parsePackageInput, validatePackageInput } from '../uv';

test('parsePackageInput splits on whitespace and commas', () => {
  assert.deepEqual(parsePackageInput('numpy pandas'), ['numpy', 'pandas']);
  assert.deepEqual(parsePackageInput('  numpy\t pandas  '), ['numpy', 'pandas']);
  assert.deepEqual(parsePackageInput('numpy,pandas'), ['numpy', 'pandas']);
  assert.deepEqual(parsePackageInput('numpy, pandas'), ['numpy', 'pandas']);
  assert.deepEqual(parsePackageInput(''), []);
});

test('parsePackageInput keeps extras and version lists intact', () => {
  assert.deepEqual(parsePackageInput('requests[socks,security]'), ['requests[socks,security]']);
  assert.deepEqual(parsePackageInput('numpy>=1.26,<3 pandas==2.2'), ['numpy>=1.26,<3', 'pandas==2.2']);
  assert.deepEqual(parsePackageInput('torch!=2.0,~=2.1'), ['torch!=2.0,~=2.1']);
});

test('validatePackageInput', () => {
  assert.equal(validatePackageInput('numpy'), undefined);
  assert.ok(validatePackageInput(''));
  assert.ok(validatePackageInput('   '));
  assert.ok(validatePackageInput('--dev numpy'));
});
