'use strict';

function classifyRecords(records, desiredType) {
  const expectedType = String(desiredType || 'A').toUpperCase();
  const sameType = records.filter((record) => String(record.type).toUpperCase() === expectedType);
  const otherType = records.filter((record) => String(record.type).toUpperCase() !== expectedType);

  if (records.length === 0) {
    return { action: 'create', sameType, otherType, reason: 'no-records-with-name' };
  }

  if (sameType.length === 0) {
    return { action: 'skip', sameType, otherType, reason: 'non-matching-type-exists' };
  }

  if (sameType.length > 1) {
    return { action: 'fail', sameType, otherType, reason: 'multiple-expected-type-records' };
  }

  return { action: 'update', record: sameType[0], sameType, otherType, reason: 'one-expected-type-record' };
}

function needsUpdate(existingRecord, desired) {
  return (
    String(existingRecord.content) !== String(desired.content) ||
    Boolean(existingRecord.proxied) !== Boolean(desired.proxied) ||
    (desired.ttl !== undefined && Number(existingRecord.ttl) !== Number(desired.ttl))
  );
}

function buildPatch(existingRecord, desired) {
  const patch = {};

  if (String(existingRecord.content) !== String(desired.content)) {
    patch.content = desired.content;
  }

  if (Boolean(existingRecord.proxied) !== Boolean(desired.proxied)) {
    patch.proxied = desired.proxied;
  }

  if (desired.ttl !== undefined && Number(existingRecord.ttl) !== Number(desired.ttl)) {
    patch.ttl = desired.ttl;
  }

  return patch;
}

module.exports = {
  buildPatch,
  classifyRecords,
  needsUpdate,
};
