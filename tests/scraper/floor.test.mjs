import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectFloor, SECOND_FLOOR } = require('../../src/scraper/floor.js');

test('detectFloor: サイトの表記「2Fにて販売いたします」は 2F', () => {
  assert.equal(detectFloor('2Fにて販売いたします'), SECOND_FLOOR);
});

test('detectFloor: 全角・小文字でも 2F', () => {
  assert.equal(detectFloor('２Ｆにて販売いたします'), '2F');
  assert.equal(detectFloor('2fにて販売'), '2F');
});

test('detectFloor: 複数の欄のどれかにあれば 2F', () => {
  assert.equal(detectFloor('', undefined, '2Fにて販売いたします'), '2F');
});

test('detectFloor: 表記がなければ null（1F と決めつけない）', () => {
  assert.equal(detectFloor(''), null);
  assert.equal(detectFloor(undefined), null);
  assert.equal(detectFloor('数量限定'), null);
  assert.equal(detectFloor('12F'), null);
});
