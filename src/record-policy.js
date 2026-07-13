'use strict';

const BLOCKING_TYPES = new Set(['CNAME']);

function classifyRecords(records, desiredType) {
  const expectedType = String(desiredType || 'A').toUpperCase();
  const sameType = records.filter((record) => String(record.type).toUpperCase() === expectedType);
  const otherType = records.filter((record) => String(record.type).toUpperCase() !== expectedType);
  const blockingType = otherType.filter((record) => BLOCKING_TYPES.has(String(record.type).toUpperCase()));

  if (sameType.length > 1) {
    return { action: 'fail', sameType, otherType, blockingType, reason: 'multiple-expected-type-records' };
  }

  if (sameType.length === 1) {
    return {
      action: 'update',
      record: sameType[0],
      sameType,
      otherType,
      blockingType,
      reason: 'one-expected-type-record',
    };
  }

  if (blockingType.length > 0) {
    return { action: 'skip', sameType, otherType, blockingType, reason: 'blocking-type-exists' };
  }

  return {
    action: 'create',
    sameType,
    otherType,
    blockingType,
    reason: records.length === 0 ? 'no-records-with-name' : 'missing-expected-type',
  };
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
  BLOCKING_TYPES,
  buildPatch,
  classifyRecords,
  needsUpdate,
};
