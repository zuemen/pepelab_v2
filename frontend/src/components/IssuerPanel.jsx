import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { QRCodeCanvas } from 'qrcode.react';
import { resolveSandboxPrefix } from '../api/client.js';
import { ISSUE_LOG_STORAGE_KEY } from '../constants/storage.js';
import { computeRevocationDetails } from '../utils/revocation.js';
import { normalizeCid, parseCidFromJti } from '../utils/cid.js';
import {
  describeCredentialStatus,
  isCollectedStatus,
  isRevokedStatus,
  normalizeCredentialStatus,
} from '../utils/status.js';

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }

  const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  try {
    const decoded = atob(padded);
    const json = decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

function flattenCandidates(...values) {
  const queue = [...values];
  const result = [];

  while (queue.length) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.unshift(...value);
      continue;
    }
    if (value === undefined || value === null) {
      continue;
    }
    result.push(value);
  }

  return result;
}

function createSecureId(prefix) {
  const safePrefix = prefix || 'id';

  if (typeof crypto !== 'undefined') {
    if (crypto.randomUUID) {
      return `${safePrefix}-${crypto.randomUUID()}`;
    }

    if (crypto.getRandomValues) {
      const buffer = new Uint8Array(16);
      crypto.getRandomValues(buffer);
      const hex = Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${safePrefix}-${hex.slice(0, 32)}`;
    }
  }

  return `${safePrefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function pickStringCandidate(...values) {
  const candidates = flattenCandidates(values);
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return '';
}

function pickTimestampCandidate(...values) {
  const candidates = flattenCandidates(values);
  for (const candidate of candidates) {
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return candidate.toISOString();
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      try {
        return new Date(candidate).toISOString();
      } catch (error) {
        continue;
      }
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }

      if (/^\d{10}$/.test(trimmed)) {
        const epoch = Number(trimmed) * 1000;
        if (!Number.isNaN(epoch)) {
          return new Date(epoch).toISOString();
        }
      }

      if (/^\d{13}$/.test(trimmed)) {
        const epoch = Number(trimmed);
        if (!Number.isNaN(epoch)) {
          return new Date(epoch).toISOString();
        }
      }

      return trimmed;
    }
  }

  return null;
}

function pickBooleanFlag(values, extraKeywords = []) {
  const candidates = flattenCandidates(values);
  const baseKeywords = ['true', '1', 'yes', 'y', 'accepted', 'collected', 'active', 'done', 'complete', 'completed'];
  const positiveKeywords = new Set(
    baseKeywords.concat(extraKeywords.map((keyword) => keyword.toLowerCase())).map((keyword) => keyword.toLowerCase()),
  );
  const negativeKeywords = new Set(['false', '0', 'no', 'n', 'pending', 'waiting', 'issued', 'uncollected', 'not_collected', 'notcollected', 'inactive']);

  for (const candidate of candidates) {
    if (candidate === true) {
      return true;
    }

    if (candidate === false || candidate === null) {
      continue;
    }

    if (typeof candidate === 'number') {
      if (Number.isFinite(candidate) && candidate > 0) {
        return true;
      }
      continue;
    }

    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) {
        continue;
      }

      if (negativeKeywords.has(normalized)) {
        continue;
      }

      const sanitized = normalized.replace(/[_-]+/g, ' ');
      const tokens = sanitized.split(/\s+/).filter(Boolean);

      if (positiveKeywords.has(normalized)) {
        return true;
      }

      for (const token of tokens) {
        if (positiveKeywords.has(token)) {
          if (token === 'active' && normalized === 'inactive') {
            break;
          }
          return true;
        }
      }

      for (const keyword of positiveKeywords) {
        if (normalized.includes(keyword) && !normalized.startsWith(`un${keyword}`) && !normalized.includes(`not ${keyword}`)) {
          if (keyword === 'active' && normalized.includes('inactive')) {
            break;
          }
          return true;
        }
      }
    }
  }

  return false;
}

function extractCredentialIdentifiers(credentialJwt) {
  if (!credentialJwt || typeof credentialJwt !== 'string') {
    return {
      cid: '',
      jti: '',
      status: '',
      collectedAt: null,
      revokedAt: null,
      holderDid: '',
      collected: false,
      revoked: false,
      payload: null,
    };
  }

  const payload = decodeJwtPayload(credentialJwt);
  if (!payload || typeof payload !== 'object') {
    return {
      cid: '',
      jti: '',
      status: '',
      collectedAt: null,
      revokedAt: null,
      holderDid: '',
      collected: false,
      revoked: false,
      payload: null,
    };
  }

  const jti = pickStringCandidate(payload.jti);
  let cid = jti ? parseCidFromJti(jti) : '';
  if (!cid) {
    cid = pickStringCandidate(
      payload.cid,
      payload.credentialId,
      payload.credential_id,
      payload.credentialID,
      payload.vc?.credentialId,
      payload.vc?.credential_id,
      payload.vc?.credentialID,
    );
  }

  const status = pickStringCandidate(
    payload.status,
    payload.cardStatus,
    payload.credential_status,
    payload.credentialStatus?.status,
    payload.credentialStatus?.currentStatus,
    payload.credentialStatus?.statusCode,
    payload.credentialStatus?.state,
    payload.vc?.credentialStatus?.status,
    payload.vc?.credentialStatus?.currentStatus,
    payload.vc?.credentialStatus?.statusCode,
    payload.vc?.credentialStatus?.state,
  );

  const collectedAt = pickTimestampCandidate(
    payload.acceptedAt,
    payload.accepted_at,
    payload.collectedAt,
    payload.collected_at,
    payload.credentialStatus?.acceptedAt,
    payload.credentialStatus?.accepted_at,
    payload.credentialStatus?.collectedAt,
    payload.credentialStatus?.collected_at,
    payload.vc?.credentialStatus?.acceptedAt,
    payload.vc?.credentialStatus?.accepted_at,
    payload.vc?.credentialStatus?.collectedAt,
    payload.vc?.credentialStatus?.collected_at,
  );

  const revokedAt = pickTimestampCandidate(
    payload.revokedAt,
    payload.revoked_at,
    payload.credentialStatus?.revokedAt,
    payload.credentialStatus?.revoked_at,
    payload.vc?.credentialStatus?.revokedAt,
    payload.vc?.credentialStatus?.revoked_at,
  );

  const holderDid = pickStringCandidate(
    payload.holderDid,
    payload.holder_did,
    payload.holder,
    payload.sub,
    payload.subject,
    payload.credentialSubject?.id,
    payload.credentialSubject?.did,
    payload.credentialSubject?.holderDid,
    payload.credentialSubject?.holder_did,
  );

  const collected = pickBooleanFlag(
    [
      payload.collected,
      payload.accepted,
      payload.credentialStatus?.collected,
      payload.credentialStatus?.accepted,
      payload.credentialStatus?.active,
      payload.vc?.credentialStatus?.collected,
      payload.vc?.credentialStatus?.accepted,
      payload.vc?.credentialStatus?.active,
    ],
  );

  const revoked = pickBooleanFlag(
    [
      payload.revoked,
      payload.credentialStatus?.revoked,
      payload.credentialStatus?.inactive,
      payload.vc?.credentialStatus?.revoked,
      payload.vc?.credentialStatus?.inactive,
    ],
    ['revoked', 'inactive', 'suspended'],
  );

  return { cid, jti, status, collectedAt, revokedAt, holderDid, collected, revoked, payload };
}

function describeLookupSource(source) {
  switch (source) {
    case 'response':
      return '政府 API 回應';
    case 'nonce':
      return 'nonce 查詢';
    case 'manual':
      return '手動登錄';
    case 'wallet':
      return '皮夾同步';
    case 'transaction':
      return '待官方查詢';
    default:
      return null;
  }
}

const DEFAULT_DISCLOSURES = {
  MEDICAL_RECORD: [
    'condition.code.coding[0].code',
    'condition.recordedDate',
    'managing_organization.value',
  ],
  MEDICATION_PICKUP: [
    'medication_dispense[0].medicationCodeableConcept.coding[0].code',
    'medication_dispense[0].days_supply',
    'medication_dispense[0].pickup_window_end',
  ],
  CONSENT_CARD: ['consent.scope', 'consent.purpose', 'consent.expires_on'],
  ALLERGY_CARD: ['allergies[0].code.coding[0].code', 'allergies[0].criticality'],
  IDENTITY_CARD: [
    'identity.pid_hash',
    'identity.pid_type',
    'identity.pid_ver',
    'identity.pid_issuer',
    'identity.pid_valid_to',
    'identity.wallet_id',
  ],
};

const PRIMARY_SCOPE_OPTIONS = [
  {
    value: 'MEDICAL_RECORD',
    label: '病況卡（vc_cond）－7 天後自動封存',
  },
  {
    value: 'MEDICATION_PICKUP',
    label: '處方領藥卡（vc_rx）－3 天後自動刪除',
  },
  {
    value: 'CONSENT_CARD',
    label: '數據同意卡（vc_cons）－180 天授權保留',
  },
  {
    value: 'ALLERGY_CARD',
    label: '過敏資訊卡（vc_algy）－預設 3 年效期',
  },
  {
    value: 'IDENTITY_CARD',
    label: '匿名身分卡（vc_pid）－預設 10 年效期',
  },
];

const PRIMARY_SCOPE_LABEL = PRIMARY_SCOPE_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});

const HOLDER_PROFILES = [
  {
    did: 'did:example:patient-001',
    hint: '張小華 1962/07/18',
    label: '張小華（病歷授權）',
  },
  {
    did: 'did:example:patient-002',
    hint: '王曉梅 1984/03/02',
    label: '王曉梅（領藥授權）',
  },
];

const SCOPE_TO_VC_UID = {
  MEDICAL_RECORD: '00000000_vc_cond',
  MEDICATION_PICKUP: '00000000_vc_rx',
  CONSENT_CARD: '00000000_vc_cons',
  ALLERGY_CARD: '00000000_vc_algy',
  IDENTITY_CARD: '00000000_vc_pid',
};

const DEFAULT_CARD_IDENTIFIERS = {
  MEDICAL_RECORD: {
    vcUid: '00000000_vc_cond',
    vcCid: 'vc_cond',
    vcId: '',
    apiKey: '',
  },
  MEDICATION_PICKUP: {
    vcUid: '00000000_vc_rx',
    vcCid: 'vc_rx',
    vcId: '',
    apiKey: '',
  },
  CONSENT_CARD: {
    vcUid: '00000000_vc_cons',
    vcCid: 'vc_cons',
    vcId: '',
    apiKey: '',
  },
  ALLERGY_CARD: {
    vcUid: '00000000_vc_algy',
    vcCid: 'vc_algy',
    vcId: '',
    apiKey: '',
  },
  IDENTITY_CARD: {
    vcUid: '00000000_vc_pid',
    vcCid: 'vc_pid',
    vcId: '',
    apiKey: '',
  },
};

const CARD_SCOPE_MAP = {
  MEDICAL_RECORD: 'MEDICAL_RECORD',
  MEDICATION_PICKUP: 'MEDICATION_PICKUP',
  CONSENT_CARD: 'RESEARCH_ANALYTICS',
  ALLERGY_CARD: 'MEDICAL_RECORD',
  IDENTITY_CARD: 'RESEARCH_ANALYTICS',
};

const resolveDisclosureScope = (cardType) => CARD_SCOPE_MAP[cardType] || 'MEDICAL_RECORD';

const BASIC_SCENARIOS = [
  {
    key: 'record',
    label: '門診授權',
    description: '只送出診斷代碼與同意卡，其他欄位預設保留為選擇性揭露。',
    scope: 'MEDICAL_RECORD',
  },
  {
    key: 'pickup',
    label: '領藥取藥',
    description: '帶入處方領藥資訊並預設 3 天有效的領藥卡。',
    scope: 'MEDICATION_PICKUP',
  },
  {
    key: 'research',
    label: '研究揭露',
    description: '預設研究用途的同意書欄位，搭配診斷摘要供研究單位驗證。',
    scope: 'CONSENT_CARD',
  },
  {
    key: 'allergy',
    label: '過敏資訊',
    description: '僅揭露過敏代碼與嚴重程度，預設 3 年效期的過敏資訊卡。',
    scope: 'ALLERGY_CARD',
  },
  {
    key: 'identity',
    label: '匿名身分',
    description: '產生 PID 雜湊與皮夾識別碼，預設 10 年效期的匿名身分卡。',
    scope: 'IDENTITY_CARD',
  },
];

const INITIAL_MANUAL_LOOKUP_STATE = {
  loading: false,
  transactionId: null,
  cid: '',
  credentialJti: '',
  status: null,
  collected: false,
  holderDid: null,
  collectedAt: null,
  revokedAt: null,
  error: null,
  pending: false,
  hint: null,
};

const INITIAL_CONDITION = {
  id: createSecureId('cond'),
  system: 'http://hl7.org/fhir/sid/icd-10',
  code: 'K2970',
  display: 'CHRONICGASTRITIS',
  recordedDate: dayjs().format('YYYY-MM-DD'),
  encounter: 'enc-001',
  subject: 'did:example:patient-001',
  managingOrg: 'org:tph-001',
};

const INITIAL_MEDICATION = {
  id: createSecureId('med'),
  system: 'http://www.whocc.no/atc',
  code: 'A02BC05',
  display: 'Serenitol',
  quantityText: '3 TABLET',
  doesText: '每日一次50mg飯後',
  daysSupply: 30,
  pickupWindowEnd: dayjs().add(3, 'day').format('YYYY-MM-DD'),
  performer: 'did:example:rx-unit-01',
};

const INITIAL_ALLERGY = {
  id: createSecureId('algy'),
  system: 'http://hl7.org/fhir/sid/icd-10',
  code: 'Z881',
  display: 'PENICILLIN',
  severity: '2',
};

const INITIAL_IDENTITY = {
  pidHash: '12345678',
  pidType: '01',
  pidVer: '01',
  pidIssuer: '886',
  pidValidTo: dayjs().add(10, 'year').format('YYYY-MM-DD'),
  walletId: '10000001',
};

function buildPayload({
  condition,
  includeMedication,
  medication,
  encounterHash,
  issuedOn,
  consentExpiry,
  consentScope,
  consentPurpose,
  consentPath,
  allergy,
  identity,
}) {
  return {
    fhir_profile: 'https://profiles.iisigroup.com.tw/StructureDefinition/medssi-bundle',
    condition: {
      resourceType: 'Condition',
      id: condition.id,
      code: {
        coding: [
          {
            system: condition.system,
            code: condition.code,
            display: condition.display || undefined,
          },
        ],
        text: condition.display || undefined,
      },
      recordedDate: condition.recordedDate,
      encounter: {
        system: 'urn:medssi:encounter-id',
        value: condition.encounter,
      },
      subject: {
        system: 'did:example',
        value: condition.subject,
      },
    },
    encounter_summary_hash: encounterHash,
    managing_organization: {
      system: 'urn:medssi:org',
      value: condition.managingOrg,
    },
    issued_on: issuedOn,
    consent_expires_on: consentExpiry || undefined,
    consent:
      consentScope || consentPurpose || consentPath
        ? {
            scope: consentScope || undefined,
            purpose: consentPurpose || undefined,
            path: consentPath || undefined,
            expires_on: consentExpiry || undefined,
          }
        : undefined,
    medication_dispense: includeMedication
      ? [
          {
            resourceType: 'MedicationDispense',
            id: medication.id,
            medicationCodeableConcept: {
              coding: [
                {
                  system: medication.system,
                  code: medication.code,
                  display: medication.display || undefined,
                },
              ],
              text: medication.display || undefined,
            },
            quantity_text: medication.quantityText,
            dosage_text: medication.doesText || undefined,
            days_supply: Number(medication.daysSupply) || 0,
            performer: medication.performer
              ? {
                  system: 'did:example',
                  value: medication.performer,
                }
              : undefined,
            pickup_window_end: medication.pickupWindowEnd || undefined,
          },
        ]
      : [],
    allergies:
      allergy && (allergy.code || allergy.display || allergy.severity)
        ? [
            {
              resourceType: 'AllergyIntolerance',
              id: allergy.id,
              code: {
                coding: [
                  {
                    system: allergy.system || 'http://hl7.org/fhir/sid/icd-10',
                    code: allergy.code || '',
                    display: allergy.display || undefined,
                  },
                ],
                text: allergy.display || undefined,
              },
              criticality: allergy.severity || undefined,
            },
          ]
        : [],
    identity:
      identity &&
      (identity.pidHash ||
        identity.pidType ||
        identity.pidVer ||
        identity.pidIssuer ||
        identity.pidValidTo ||
        identity.walletId)
        ? {
            pid_hash: identity.pidHash || undefined,
            pid_type: identity.pidType || undefined,
            pid_ver: identity.pidVer || undefined,
            pid_issuer: identity.pidIssuer || undefined,
            pid_valid_to: identity.pidValidTo || undefined,
            wallet_id: identity.walletId || undefined,
          }
        : undefined,
  };
}

function parseQuantityParts(quantityText) {
  if (!quantityText) {
    return { value: '', unit: '' };
  }
  const match = quantityText.match(/^[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
  if (match) {
    return { value: match[1] ?? '', unit: (match[2] ?? '').trim() };
  }
  return { value: '', unit: quantityText.trim() };
}

function resolveExpiry(scope, consentExpiry, medication) {
  if (consentExpiry) {
    const parsed = dayjs(consentExpiry);
    if (parsed.isValid()) {
      return parsed;
    }
  }

  switch (scope) {
    case 'MEDICATION_PICKUP': {
      if (medication?.pickupWindowEnd) {
        const parsed = dayjs(medication.pickupWindowEnd);
        if (parsed.isValid()) {
          return parsed;
        }
      }
      return dayjs().add(3, 'day');
    }
    case 'CONSENT_CARD':
      return dayjs().add(180, 'day');
    case 'ALLERGY_CARD':
      return dayjs().add(3, 'year');
    case 'IDENTITY_CARD':
      return dayjs().add(10, 'year');
    default:
      return dayjs().add(7, 'day');
  }
}

function normalizeDigits(value, { fallback = '', length } = {}) {
  const fallbackDigits = String(fallback ?? '').replace(/[^0-9]/g, '');
  const digits = String(value ?? '')
    .replace(/[^0-9]/g, '')
    .trim();
  if (length) {
    const source = digits || fallbackDigits;
    if (!source) {
      return ''.padStart(length, '0');
    }
    if (source.length >= length) {
      return source.slice(0, length);
    }
    return source.padStart(length, '0');
  }
  return digits || fallbackDigits;
}

function normalizeAlphaNumUpper(value, fallback = '') {
  const cleaned = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  return cleaned || fallback;
}

function normalizeCnEnText(value, fallback = '') {
  const cleaned = String(value ?? '')
    .replace(/[^0-9A-Za-z\u4E00-\u9FFF\s-]/g, '')
    .trim();
  return cleaned || fallback;
}

function normalizeDate(value, fallbackMoment) {
  const parsed = dayjs(value);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DD');
  }
  const fb = fallbackMoment && fallbackMoment.isValid() ? fallbackMoment : dayjs();
  return fb.format('YYYY-MM-DD');
}

function normalizePath(value, fallback = 'CONSENT_001') {
  const cleaned = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .trim();
  return cleaned || fallback;
}

function convertToGovFormat({
  payload,
  scope,
  medication,
  consentScope,
  consentPurpose,
  consentPath,
  consentExpiry,
  allergy,
  identity,
  identifiers = {},
}) {
  const cardScope = scope;
  const issuanceDate = dayjs().format('YYYYMMDD');
  const expiry = resolveExpiry(cardScope, consentExpiry, medication);
  const expiredDate = expiry.isValid()
    ? expiry.format('YYYYMMDD')
    : dayjs().add(90, 'day').format('YYYYMMDD');

  const disclosureScope = resolveDisclosureScope(cardScope);
  const requestScope = disclosureScope || cardScope;

  const normalizedIdentifiers = {
    vcUid: identifiers.vcUid || SCOPE_TO_VC_UID[cardScope] || '00000000_vc_cond',
    vcCid: identifiers.vcCid || '',
    vcId: identifiers.vcId || '',
    apiKey: identifiers.apiKey || '',
  };

  const fields = [];

  const pushField = (ename, content) => {
    if (content === undefined || content === null) {
      return;
    }
    const trimmed = String(content).trim();
    if (!trimmed) {
      return;
    }
    fields.push({ type: 'NORMAL', ename, content: trimmed });
  };

  if (cardScope === 'MEDICAL_RECORD' && payload?.condition) {
    const coding = payload.condition.code?.coding?.[0] ?? {};
    const codeValue = normalizeAlphaNumUpper(coding.code, 'K2970');
    const displayValue = normalizeCnEnText(
      coding.display || payload.condition.code?.text,
      'CHRONICGASTRITIS'
    );
    const onsetValue = normalizeDate(payload.condition.recordedDate, expiry);
    pushField('cond_code', codeValue);
    pushField('cond_display', displayValue);
    pushField('cond_onset', onsetValue);
  }

  if (cardScope === 'MEDICATION_PICKUP' && medication) {
    const quantityParts = parseQuantityParts(medication.quantityText);
    const medCode = normalizeAlphaNumUpper(medication.code, 'RX0001');
    const medName = normalizeCnEnText(medication.display, 'Serenitol');
    const doesText = normalizeCnEnText(
      medication.doesText || medication.quantityText || `${medication.display || ''}${medication.daysSupply || ''}`,
      '每日一次50mg飯後'
    );
    const qtyValue = normalizeDigits(quantityParts.value || medication.daysSupply, {
      fallback: '3',
    });
    const qtyUnit = normalizeCnEnText(quantityParts.unit || 'TABLET', 'TABLET');
    pushField('med_code', medCode);
    pushField('med_name', medName);
    pushField('does_text', doesText);
    pushField('qty_value', qtyValue);
    pushField('qty_unit', qtyUnit);
  }

  if (cardScope === 'CONSENT_CARD') {
    const normalizedScope = normalizeCnEnText(consentScope, 'MEDSSI01');
    const normalizedPurpose = normalizeCnEnText(consentPurpose, 'MEDDATARESEARCH');
    const normalizedEnd = normalizeDate(expiry, expiry);
    const normalizedPath = normalizePath(consentPath);
    pushField('cons_scope', normalizedScope);
    pushField('cons_purpose', normalizedPurpose);
    pushField('cons_end', normalizedEnd);
    pushField('cons_path', normalizedPath);
  }

  if (cardScope === 'ALLERGY_CARD') {
    const algyCode = normalizeAlphaNumUpper(allergy?.code, 'ALG001');
    const algyName = normalizeCnEnText(allergy?.display, 'PENICILLIN');
    const algySeverity = normalizeDigits(allergy?.severity, { fallback: '2' });
    pushField('algy_code', algyCode);
    pushField('algy_name', algyName);
    pushField('algy_severity', algySeverity);
  }

  if (cardScope === 'IDENTITY_CARD') {
    const pidHash = normalizeDigits(identity?.pidHash, { fallback: '12345678', length: 8 });
    const pidType = normalizeDigits(identity?.pidType, { fallback: '01' });
    const pidIssuer = normalizeDigits(identity?.pidIssuer, { fallback: '886' });
    const pidVer = normalizeDigits(identity?.pidVer, { fallback: '01' });
    const pidValidTo = normalizeDate(identity?.pidValidTo, expiry);
    const walletId = normalizeDigits(identity?.walletId, { fallback: '10000001' });
    pushField('pid_hash', pidHash);
    pushField('pid_type', pidType);
    pushField('pid_ver', pidVer);
    pushField('pid_issuer', pidIssuer);
    pushField('pid_valid_to', pidValidTo);
    pushField('wallet_id', walletId);
  }

  const filtered = fields;

  const payloadBase = {
    vcUid: normalizedIdentifiers.vcUid,
    issuanceDate,
    expiredDate,
  };

  const assignIfPresent = (key, value) => {
    if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text) {
        payloadBase[key] = text;
      }
    }
  };

  assignIfPresent('vcCid', normalizedIdentifiers.vcCid);
  assignIfPresent('vcId', normalizedIdentifiers.vcId);
  assignIfPresent('apiKey', normalizedIdentifiers.apiKey);

  return {
    scope: requestScope,
    primaryScope: cardScope,
    cardScope,
    disclosureScope,
    ...payloadBase,
    fields: filtered,
  };
}

export function IssuerPanel({
  client,
  issuerToken,
  walletToken,
  baseUrl,
  onLatestTransactionChange,
  isExpertMode = true,
}) {
  const [issuerId, setIssuerId] = useState('did:example:hospital-001');
  const [holderDid, setHolderDid] = useState('did:example:patient-001');
  const [holderHint, setHolderHint] = useState('張小華 1962/07/18');
  const [holderInventoryDid, setHolderInventoryDid] = useState('did:example:patient-001');
  const [ial, setIal] = useState('NHI_CARD_PIN');
  const [validMinutes, setValidMinutes] = useState(5);
  const [primaryScope, setPrimaryScope] = useState('MEDICAL_RECORD');
  const [condition, setCondition] = useState(INITIAL_CONDITION);
  const [includeMedication, setIncludeMedication] = useState(true);
  const [medication, setMedication] = useState(INITIAL_MEDICATION);
  const [encounterHash, setEncounterHash] = useState(
    'urn:sha256:3a1f0c98c5d4a4efed2d4dfe58e8'
  );
  const [consentExpiry, setConsentExpiry] = useState('');
  const [consentScopeCode, setConsentScopeCode] = useState('MEDSSI01');
  const [consentPurpose, setConsentPurpose] = useState('MEDDATARESEARCH');
  const [consentPath, setConsentPath] = useState('IRB2025001');
  const [medicalFields, setMedicalFields] = useState(
    DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', ')
  );
  const [medicationFields, setMedicationFields] = useState(
    DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', ')
  );
  const [consentFields, setConsentFields] = useState(
    DEFAULT_DISCLOSURES.CONSENT_CARD.join(', ')
  );
  const [allergyInfo, setAllergyInfo] = useState(INITIAL_ALLERGY);
  const [identityInfo, setIdentityInfo] = useState(INITIAL_IDENTITY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [holderInventory, setHolderInventory] = useState([]);
  const [holderInventoryLoading, setHolderInventoryLoading] = useState(false);
  const [holderInventoryError, setHolderInventoryError] = useState(null);
  const [holderInventoryFetchedAt, setHolderInventoryFetchedAt] = useState(null);
  const [holderInventoryActions, setHolderInventoryActions] = useState({});
  const [forgetState, setForgetState] = useState({ loading: false, error: null, message: null });
  const [basicScenario, setBasicScenario] = useState('pickup');
  const sanitizedBaseUrl = useMemo(() => {
    if (!baseUrl) {
      return '';
    }
    return baseUrl.trim().replace(/\/+$/, '');
  }, [baseUrl]);
  const sandboxPrefix = useMemo(
    () => resolveSandboxPrefix(sanitizedBaseUrl),
    [sanitizedBaseUrl],
  );

  useEffect(() => {
    if (!isExpertMode) {
      loadSample();
      const matched = BASIC_SCENARIOS.find((scenario) => scenario.key === basicScenario);
      if (matched) {
        setPrimaryScope(matched.scope);
      }
      applyBasicTemplate(basicScenario);
    }
  }, [basicScenario, isExpertMode]);
  const normalizeIssueEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const rawCardScope = entry.cardScope || entry.primaryScope || null;
    const normalizedCardScope = rawCardScope || (entry.scope && PRIMARY_SCOPE_LABEL[entry.scope] ? entry.scope : null);
    const normalizedScope =
      entry.scope || (normalizedCardScope ? resolveDisclosureScope(normalizedCardScope) : null) || 'MEDICAL_RECORD';
    const normalizedJti = entry.credentialJti
      ? String(entry.credentialJti).trim()
      : entry.jti
      ? String(entry.jti).trim()
      : '';
    let normalizedCid = normalizeCid(entry.cid);
    if (!normalizedCid && normalizedJti) {
      normalizedCid = parseCidFromJti(normalizedJti);
    }

    const normalizedStatus = normalizeCredentialStatus(entry.status) || 'ISSUED';
    const statusDetails = describeCredentialStatus(normalizedStatus);
    const combinedCollected = Boolean(entry.collected || statusDetails.collected);
    const collectedAt =
      entry.collectedAt || (combinedCollected ? entry.collectedAt || entry.collected_at || null : null);
    const revokedAt = entry.revokedAt || entry.revoked_at || null;
    const lookupPending = Boolean(entry.cidLookupPending);
    const lookupHint =
      typeof entry.cidLookupHint === 'string' && entry.cidLookupHint.trim().length
        ? entry.cidLookupHint.trim()
        : null;
    const lookupError =
      typeof entry.cidLookupError === 'string' && entry.cidLookupError.trim().length
        ? entry.cidLookupError.trim()
        : null;

    const entryPrefix =
      typeof entry.cidSandboxPrefix === 'string' ? entry.cidSandboxPrefix : sandboxPrefix;
    const storedPath =
      entry.cidRevocationPath && typeof entry.cidRevocationPath === 'string'
        ? entry.cidRevocationPath
        : '';
    const storedDisplayPath =
      entry.cidRevocationDisplayPath && typeof entry.cidRevocationDisplayPath === 'string'
        ? entry.cidRevocationDisplayPath
        : '';
    const storedUrl =
      entry.cidRevocationUrl && typeof entry.cidRevocationUrl === 'string'
        ? entry.cidRevocationUrl
        : '';
    const storedDisplayUrl =
      entry.cidRevocationDisplayUrl && typeof entry.cidRevocationDisplayUrl === 'string'
        ? entry.cidRevocationDisplayUrl
        : '';

    const revocationDetails = computeRevocationDetails({
      cid: normalizedCid,
      sandboxPrefix: entryPrefix,
      baseUrl: sanitizedBaseUrl,
      storedPath,
      storedUrl,
      storedDisplayPath,
      storedDisplayUrl,
    });

    return {
      timestamp: entry.timestamp || new Date().toISOString(),
      holderDid: entry.holderDid || '',
      issuerId: entry.issuerId || '',
      transactionId: entry.transactionId || '',
      cid: normalizedCid,
      credentialJti: normalizedJti,
      cidSandboxPrefix: entryPrefix,
      cidRevocationPath: revocationDetails.path,
      cidRevocationDisplayPath: revocationDetails.displayPath,
      cidRevocationUrl: revocationDetails.url,
      cidRevocationDisplayUrl: revocationDetails.displayUrl,
      hasCredential: Boolean(entry.hasCredential || normalizedCid),
      scope: normalizedScope,
      scopeLabel:
        entry.scopeLabel ||
        (normalizedCardScope && PRIMARY_SCOPE_LABEL[normalizedCardScope]) ||
        PRIMARY_SCOPE_LABEL[normalizedScope] ||
        normalizedScope,
      cardScope: normalizedCardScope || normalizedScope,
      cardScopeLabel:
        (normalizedCardScope && PRIMARY_SCOPE_LABEL[normalizedCardScope]) ||
        entry.scopeLabel ||
        PRIMARY_SCOPE_LABEL[normalizedScope] ||
        normalizedScope,
      status: normalizedStatus,
      collected: combinedCollected,
      collectedAt,
      revokedAt,
      cidLookupSource: entry.cidLookupSource || null,
      cidLookupError: lookupError,
      cidLookupPending: lookupPending,
      cidLookupHint: lookupHint,
    };
  };

  const [issueLog, setIssueLog] = useState(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const stored = window.localStorage.getItem(ISSUE_LOG_STORAGE_KEY);
      if (!stored) {
        return [];
      }
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((entry) => normalizeIssueEntry(entry))
        .filter(Boolean)
        .slice(0, 50);
    } catch (err) {
      console.warn('Unable to restore issuance log', err);
      return [];
    }
  });
  useEffect(() => {
    setIssueLog((previous) =>
      previous
        .map((entry) => normalizeIssueEntry(entry))
        .filter(Boolean)
        .slice(0, 50),
    );
  }, [sandboxPrefix, sanitizedBaseUrl]);
  const [issueLogActions, setIssueLogActions] = useState({});
  const [manualEntry, setManualEntry] = useState({
    holderDid: '',
    cid: '',
    credentialJti: '',
    transactionId: '',
    scope: 'MEDICAL_RECORD',
    status: '',
    collected: false,
  });
  const [manualLookup, setManualLookup] = useState(INITIAL_MANUAL_LOOKUP_STATE);
  const [manualEntryFeedback, setManualEntryFeedback] = useState(null);
  const [manualEntryError, setManualEntryError] = useState(null);
  const [manualEntryLoading, setManualEntryLoading] = useState(false);
  const [govIdentifiers, setGovIdentifiers] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CARD_IDENTIFIERS;
    }
    try {
      const stored = window.localStorage.getItem('medssi.govIdentifiers');
      if (!stored) {
        return DEFAULT_CARD_IDENTIFIERS;
      }
      const parsed = JSON.parse(stored);
      return {
        MEDICAL_RECORD: {
          ...DEFAULT_CARD_IDENTIFIERS.MEDICAL_RECORD,
          ...(parsed.MEDICAL_RECORD || {}),
        },
        MEDICATION_PICKUP: {
          ...DEFAULT_CARD_IDENTIFIERS.MEDICATION_PICKUP,
          ...(parsed.MEDICATION_PICKUP || {}),
        },
        CONSENT_CARD: {
          ...DEFAULT_CARD_IDENTIFIERS.CONSENT_CARD,
          ...(parsed.CONSENT_CARD || {}),
        },
        ALLERGY_CARD: {
          ...DEFAULT_CARD_IDENTIFIERS.ALLERGY_CARD,
          ...(parsed.ALLERGY_CARD || {}),
        },
        IDENTITY_CARD: {
          ...DEFAULT_CARD_IDENTIFIERS.IDENTITY_CARD,
          ...(parsed.IDENTITY_CARD || {}),
        },
      };
    } catch (err) {
      console.warn('Unable to restore government VC identifiers', err);
      return DEFAULT_CARD_IDENTIFIERS;
    }
  });

  useEffect(() => {
    setHolderInventoryDid(holderDid);
  }, [holderDid]);

  useEffect(() => {
    if (primaryScope === 'MEDICATION_PICKUP' && !includeMedication) {
      setIncludeMedication(true);
    }
  }, [primaryScope, includeMedication]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('medssi.govIdentifiers', JSON.stringify(govIdentifiers));
    }
  }, [govIdentifiers]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(ISSUE_LOG_STORAGE_KEY, JSON.stringify(issueLog));
        const eventDetail = { issueLog };
        if (typeof window.CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('medssi:issue-log-updated', { detail: eventDetail }));
        } else {
          window.dispatchEvent(new Event('medssi:issue-log-updated'));
        }
      } catch (err) {
        console.warn('Unable to persist issuance log', err);
      }
    }
  }, [issueLog]);

  const currentIdentifiers = govIdentifiers[primaryScope] || DEFAULT_CARD_IDENTIFIERS[primaryScope];

  const updateIdentifier = (key, value) => {
    setGovIdentifiers((previous) => ({
      ...previous,
      [primaryScope]: {
        ...(previous[primaryScope] || {}),
        [key]: value,
      },
    }));
  };

  const disclosurePolicies = useMemo(() => {
    const entries = [
      ['MEDICAL_RECORD', medicalFields],
      ['MEDICATION_PICKUP', medicationFields],
      ['CONSENT_CARD', consentFields],
      ['ALLERGY_CARD', DEFAULT_DISCLOSURES.ALLERGY_CARD.join(', ')],
      ['IDENTITY_CARD', DEFAULT_DISCLOSURES.IDENTITY_CARD.join(', ')],
    ];
    return entries
      .map(([scope, value]) => ({
        scope,
        fields: value
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean),
      }))
      .filter((item) => item.fields.length);
  }, [medicalFields, medicationFields, consentFields]);

  const payloadTemplate = useMemo(
    () =>
      buildPayload({
        condition,
        includeMedication: includeMedication || primaryScope === 'MEDICATION_PICKUP',
        medication,
        encounterHash,
        issuedOn: dayjs().format('YYYY-MM-DD'),
        consentExpiry: consentExpiry || null,
        consentScope: consentScopeCode,
        consentPurpose,
        consentPath,
        allergy: allergyInfo,
        identity: identityInfo,
      }),
    [
      condition,
      includeMedication,
      medication,
      encounterHash,
      consentExpiry,
      primaryScope,
      consentScopeCode,
      consentPurpose,
      consentPath,
      allergyInfo,
      identityInfo,
    ]
  );

  const issueLogStats = useMemo(() => {
    const total = issueLog.length;
    const revoked = issueLog.filter((entry) => isRevokedStatus(entry.status)).length;
    const collected = issueLog.filter((entry) => entry.collected || isCollectedStatus(entry.status)).length;
    const pending = total - collected;
    const active = total - revoked;
    return { total, revoked, collected, pending, active };
  }, [issueLog]);

  const holderAccessToken = useMemo(() => walletToken || issuerToken, [walletToken, issuerToken]);

  const appendIssueLogEntry = (rawEntry) => {
    const entry = normalizeIssueEntry(rawEntry);
    if (!entry) {
      return null;
    }

    setIssueLog((previous) => {
      const filtered = previous.filter((item) => {
        if (entry.transactionId && item.transactionId === entry.transactionId) {
          return false;
        }
        if (entry.cid && item.cid === entry.cid) {
          return false;
        }
        return true;
      });
      return [entry, ...filtered].slice(0, 50);
    });

    return entry;
  };

  const lookupCredentialByTransaction = async (transactionId) => {
    const trimmedId = (transactionId || '').trim();
    if (!trimmedId) {
      return {
        ok: false,
        transactionId: '',
        cid: '',
        credentialJti: '',
        credentialJwt: null,
        hasCredential: false,
        lookupSource: 'nonce',
        lookupError: '請提供交易序號。',
        status: null,
        collectedAt: null,
        revokedAt: null,
        holderDid: null,
        collected: false,
        revoked: false,
        pending: false,
        lookupHint: null,
        detailCode: null,
      };
    }

    try {
      const response = await client.getNonce(trimmedId, issuerToken);
      if (!response.ok) {
        let detailCode = null;
        let detailMessage = null;
        if (response.detail && typeof response.detail === 'object') {
          detailCode =
            response.detail.code || response.detail.errorCode || response.detail.status || null;
          if (typeof response.detail.message === 'string') {
            detailMessage = response.detail.message;
          } else if (typeof response.detail.detail === 'string') {
            detailMessage = response.detail.detail;
          } else if (typeof response.detail.reason === 'string') {
            detailMessage = response.detail.reason;
          } else {
            detailMessage = JSON.stringify(response.detail);
          }
        } else if (typeof response.detail === 'string') {
          detailMessage = response.detail;
          const match = response.detail.match(/6\d{4}/);
          if (match) {
            detailCode = match[0];
          }
        }

        const isPending =
          detailCode === '61010' ||
          (detailMessage && /61010/.test(detailMessage)) ||
          (detailMessage && detailMessage.includes('指定VC不存在')) ||
          (detailMessage && detailMessage.includes('尚未被掃描'));

        const lookupHint = isPending
          ? detailMessage || '指定 VC 尚未建立或 QR Code 尚未被掃描。'
          : null;

        const errorMessage =
          !isPending && detailMessage
            ? `${response.status ? `(${response.status}) ` : ''}${detailMessage}`
            : !isPending
            ? '查詢官方 nonce API 失敗'
            : null;

        return {
          ok: false,
          transactionId: trimmedId,
          cid: '',
          credentialJti: '',
          credentialJwt: null,
          hasCredential: false,
          lookupSource: 'nonce',
          lookupError: errorMessage,
          status: isPending ? 'PENDING' : null,
          collected: false,
          collectedAt: null,
          revokedAt: null,
          revoked: false,
          holderDid: null,
          pending: isPending,
          lookupHint,
          detailCode,
        };
      }

      const data = response.data || {};

      let credentialJwt = null;
      if (typeof data.credential === 'string') {
        credentialJwt = data.credential;
      } else if (data.credential && typeof data.credential === 'object') {
        credentialJwt =
          data.credential.credential ||
          data.credential.jwt ||
          data.credential.credentialJwt ||
          data.credential.credential_jwt ||
          null;
      }

      credentialJwt =
        credentialJwt ||
        data.credentialJwt ||
        data.credential_jwt ||
        data.jwt ||
        data.credentialToken ||
        null;

      let credentialJti = '';
      let cid = '';
      let jwtMetadata = null;

      if (credentialJwt && typeof credentialJwt === 'string') {
        jwtMetadata = extractCredentialIdentifiers(credentialJwt);
        credentialJti = jwtMetadata.jti || '';
        cid = jwtMetadata.cid || '';
      }

      if (!credentialJti && typeof data.jti === 'string') {
        credentialJti = data.jti.trim();
      }

      if (!cid && credentialJti) {
        cid = parseCidFromJti(credentialJti);
      }

      const normalizedCid = normalizeCid(cid);
      const normalizedJti = credentialJti ? credentialJti.trim() : '';

      const credentialStatusObject =
        (data.credentialStatus && typeof data.credentialStatus === 'object'
          ? data.credentialStatus
          : null) ||
        null;
      const nestedCredential =
        data.credential && typeof data.credential === 'object' ? data.credential : null;
      const nestedCredentialStatus =
        (nestedCredential && typeof nestedCredential.credentialStatus === 'object'
          ? nestedCredential.credentialStatus
          : null) ||
        (nestedCredential && typeof nestedCredential.status === 'object'
          ? nestedCredential.status
          : null);

      const rawStatus = pickStringCandidate(
        data.status,
        data.cardStatus,
        data.credential_status,
        typeof data.credentialStatus === 'string' ? data.credentialStatus : null,
        credentialStatusObject?.status,
        credentialStatusObject?.currentStatus,
        credentialStatusObject?.statusCode,
        credentialStatusObject?.state,
        nestedCredential?.status,
        nestedCredentialStatus?.status,
        nestedCredentialStatus?.currentStatus,
        nestedCredentialStatus?.statusCode,
        nestedCredentialStatus?.state,
        jwtMetadata?.status,
      );
      const normalizedStatus = normalizeCredentialStatus(rawStatus);
      const statusDetails = describeCredentialStatus(normalizedStatus);

      const collectedAt =
        pickTimestampCandidate(
          data.acceptedAt,
          data.accepted_at,
          data.collectedAt,
          data.collected_at,
          credentialStatusObject?.acceptedAt,
          credentialStatusObject?.accepted_at,
          credentialStatusObject?.collectedAt,
          credentialStatusObject?.collected_at,
          nestedCredential?.acceptedAt,
          nestedCredential?.accepted_at,
          nestedCredentialStatus?.acceptedAt,
          nestedCredentialStatus?.accepted_at,
          nestedCredentialStatus?.collectedAt,
          nestedCredentialStatus?.collected_at,
          jwtMetadata?.collectedAt,
        ) || null;
      const revokedAt =
        pickTimestampCandidate(
          data.revokedAt,
          data.revoked_at,
          credentialStatusObject?.revokedAt,
          credentialStatusObject?.revoked_at,
          nestedCredential?.revokedAt,
          nestedCredential?.revoked_at,
          nestedCredentialStatus?.revokedAt,
          nestedCredentialStatus?.revoked_at,
          jwtMetadata?.revokedAt,
        ) || null;
      const holderDid =
        pickStringCandidate(
          data.holderDid,
          data.holder_did,
          data.holder,
          nestedCredential?.holderDid,
          nestedCredential?.holder_did,
          nestedCredentialStatus?.holderDid,
          jwtMetadata?.holderDid,
        ) || null;

      const explicitCollected = pickBooleanFlag(
        [
          data.collected,
          data.accepted,
          data.isCollected,
          credentialStatusObject?.collected,
          credentialStatusObject?.accepted,
          nestedCredential?.collected,
          nestedCredentialStatus?.collected,
          nestedCredentialStatus?.accepted,
          jwtMetadata?.collected,
        ],
      );
      const explicitRevoked = pickBooleanFlag(
        [
          data.revoked,
          credentialStatusObject?.revoked,
          credentialStatusObject?.inactive,
          nestedCredential?.revoked,
          nestedCredentialStatus?.revoked,
          nestedCredentialStatus?.inactive,
          jwtMetadata?.revoked,
        ],
        ['revoked', 'inactive', 'suspended'],
      );

      return {
        ok: true,
        transactionId: trimmedId,
        cid: normalizedCid,
        credentialJti: normalizedJti,
        credentialJwt: typeof credentialJwt === 'string' ? credentialJwt : null,
        hasCredential: Boolean(credentialJwt && typeof credentialJwt === 'string'),
        lookupSource: 'nonce',
        lookupError: null,
        status: normalizedStatus,
        collected: Boolean(statusDetails.collected || explicitCollected || collectedAt),
        collectedAt,
        revokedAt,
        revoked: Boolean(statusDetails.revoked || explicitRevoked || revokedAt),
        holderDid,
        pending: false,
        lookupHint: null,
        detailCode: null,
      };
    } catch (error) {
      return {
        ok: false,
        transactionId: trimmedId,
        cid: '',
        credentialJti: '',
        credentialJwt: null,
        hasCredential: false,
        lookupSource: 'nonce',
        lookupError: error?.message || '查詢官方 nonce API 失敗',
        status: null,
        collected: false,
        collectedAt: null,
        revokedAt: null,
        revoked: false,
        holderDid: null,
        pending: false,
        lookupHint: null,
        detailCode: null,
      };
    }
  };

  const recordIssue = async ({ credentialJwt, transactionId }) => {
    const timestamp = new Date().toISOString();
    const scopeLabel = PRIMARY_SCOPE_LABEL[primaryScope] || primaryScope;
    const resolvedScope = resolveDisclosureScope(primaryScope);

    let resolvedCredential = '';
    let cid = '';
    let credentialJti = '';
    let lookupSource = null;
    let lookupError = null;
    let lookupPending = false;
    let lookupHint = null;
    let status = 'ISSUED';
    let holderFromResponse = holderDid || '';
    let collected = false;
    let collectedAtValue = null;
    let revokedAtValue = null;
    let hasCredential = false;

    if (transactionId) {
      const lookupResult = await lookupCredentialByTransaction(transactionId);
      if (lookupResult.ok) {
        if (lookupResult.cid) {
          cid = normalizeCid(lookupResult.cid);
        }
        if (lookupResult.credentialJti) {
          credentialJti = lookupResult.credentialJti;
        }
        if (lookupResult.credentialJwt && !resolvedCredential) {
          resolvedCredential = lookupResult.credentialJwt;
        }
        if (lookupResult.hasCredential) {
          hasCredential = true;
        }
        lookupSource = 'nonce';

        if (lookupResult.status) {
          status = lookupResult.status;
        }
        if (lookupResult.collected) {
          collected = true;
        }
        if (lookupResult.collectedAt) {
          collected = true;
          collectedAtValue = lookupResult.collectedAt;
        }
        if (lookupResult.revokedAt) {
          revokedAtValue = lookupResult.revokedAt;
        }
        if (lookupResult.revoked) {
          status = 'REVOKED';
        }
        if (lookupResult.holderDid) {
          holderFromResponse = lookupResult.holderDid;
        }
      } else if (lookupResult.pending) {
        lookupSource = lookupResult.lookupSource || 'nonce';
        status = lookupResult.status || status;
        lookupPending = true;
        lookupHint = lookupResult.lookupHint || null;
      } else if (!cid) {
        lookupError = lookupResult.lookupError || '查詢官方 nonce API 失敗';
      }
    }

      if (credentialJwt) {
        if (!resolvedCredential) {
          resolvedCredential = credentialJwt;
        }
        const responseIdentifiers = extractCredentialIdentifiers(credentialJwt);
        if (!cid && responseIdentifiers.cid) {
          cid = normalizeCid(responseIdentifiers.cid);
          if (!lookupSource) {
            lookupSource = 'response';
          }
        }
        if (!credentialJti && responseIdentifiers.jti) {
          credentialJti = responseIdentifiers.jti;
        }
        if (responseIdentifiers.status && !status) {
          status = responseIdentifiers.status;
        }
        if (!collected && responseIdentifiers.collected) {
          collected = true;
        }
        if (!collectedAtValue && responseIdentifiers.collectedAt) {
          collectedAtValue = responseIdentifiers.collectedAt;
        }
        if (!revokedAtValue && responseIdentifiers.revokedAt) {
          revokedAtValue = responseIdentifiers.revokedAt;
        }
        if (!holderFromResponse && responseIdentifiers.holderDid) {
          holderFromResponse = responseIdentifiers.holderDid;
        }
        hasCredential = true;
      }

    if (!lookupSource && transactionId) {
      lookupSource = 'transaction';
    }

    const normalizedCid = normalizeCid(cid);
    const normalizedJti = credentialJti ? credentialJti.trim() : '';
    const normalizedStatus = normalizeCredentialStatus(status) || 'ISSUED';
    const statusDetails = describeCredentialStatus(normalizedStatus);
    const combinedCollected = collected || statusDetails.collected;
    const combinedCollectedAt = collectedAtValue || null;
    const combinedRevokedAt = revokedAtValue || null;

    const entry = {
      timestamp,
      holderDid: holderFromResponse || '',
      issuerId: issuerId || '',
      transactionId: transactionId || '',
      cid: normalizedCid,
      credentialJti: normalizedJti,
      cidSandboxPrefix: sandboxPrefix,
      hasCredential: Boolean(hasCredential || normalizedCid || normalizedJti),
      scope: resolvedScope,
      scopeLabel,
      cardScope: primaryScope,
      cardScopeLabel: scopeLabel,
      status: normalizedStatus,
      collected: combinedCollected,
      collectedAt: combinedCollectedAt,
      revokedAt: statusDetails.revoked ? combinedRevokedAt || timestamp : combinedRevokedAt,
      cidLookupSource: lookupSource,
      cidLookupError: lookupError,
      cidLookupPending: lookupPending,
      cidLookupHint: lookupHint,
    };

    return appendIssueLogEntry(entry);
  };

  const clearIssueLog = () => {
    setIssueLog([]);
    setIssueLogActions({});
    setManualEntryError(null);
    setManualEntryFeedback(null);
  };

  const removeIssueLogEntry = (index) => {
    setIssueLog((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateIssueLogEntry = (index, updater) => {
    setIssueLog((prev) =>
      prev.map((entry, idx) => {
        if (idx !== index) {
          return entry;
        }
        const updated = updater(entry);
        return normalizeIssueEntry(updated) || entry;
      })
    );
  };

  const toggleCollected = (index) => {
    updateIssueLogEntry(index, (entry) => {
      const nextCollected = !entry.collected;
      return {
        ...entry,
        collected: nextCollected,
        collectedAt: nextCollected ? new Date().toISOString() : null,
      };
    });
  };

  const handleManualEntryChange = (field, value) => {
    setManualEntry((prev) => ({ ...prev, [field]: value }));
    if (field === 'transactionId') {
      setManualLookup(INITIAL_MANUAL_LOOKUP_STATE);
    }
  };

  const handleManualEntrySubmit = async (event) => {
    event.preventDefault();
    if (manualEntryLoading) {
      return;
    }
    setManualEntryError(null);
    setManualEntryFeedback(null);
    setManualEntryLoading(true);

    const now = new Date().toISOString();
    let cid = normalizeCid(manualEntry.cid);
    const credentialJti = manualEntry.credentialJti.trim();
    const transactionId = manualEntry.transactionId.trim();
    let holderValue = (manualEntry.holderDid || holderDid || '').trim();

    let resolvedCredentialJti = credentialJti;
    let lookupSource = 'manual';
    let lookupError = null;
    let lookupPending = false;
    let lookupHint = null;
    let resolvedStatus = manualEntry.status || '';
    let resolvedCollected = Boolean(manualEntry.collected);
    let resolvedCollectedAt = manualEntry.collected ? now : null;
    let resolvedRevokedAt =
      normalizeCredentialStatus(manualEntry.status) === 'REVOKED' ? now : null;
    let lookupResultData = null;

    if (!cid && credentialJti) {
      cid = parseCidFromJti(credentialJti);
    }

    try {
      if (transactionId) {
        const lookupResult = await lookupCredentialByTransaction(transactionId);
        lookupResultData = lookupResult;
        if (lookupResult.ok) {
          if (!cid && lookupResult.cid) {
            cid = normalizeCid(lookupResult.cid);
          }
          if (!resolvedCredentialJti && lookupResult.credentialJti) {
            resolvedCredentialJti = lookupResult.credentialJti;
          }
          if (!holderValue && lookupResult.holderDid) {
            holderValue = lookupResult.holderDid;
          }
          if (lookupResult.status) {
            resolvedStatus = lookupResult.status;
          }
          if (!resolvedCollected && lookupResult.collected) {
            resolvedCollected = true;
          }
          if (!resolvedCollectedAt && lookupResult.collectedAt) {
            resolvedCollectedAt = lookupResult.collectedAt;
          }
          if (!resolvedRevokedAt && lookupResult.revokedAt) {
            resolvedRevokedAt = lookupResult.revokedAt;
          }
          lookupSource = 'nonce';
          lookupPending = false;
          lookupHint = null;
        } else if (!cid) {
          if (lookupResult.pending) {
            lookupSource = lookupResult.lookupSource || 'nonce';
            lookupPending = true;
            lookupHint = lookupResult.lookupHint || null;
            if (lookupResult.status) {
              resolvedStatus = lookupResult.status;
            }
          } else {
            lookupError = lookupResult.lookupError || '查詢官方 nonce API 失敗';
          }
        }
      }

      if (!cid && !transactionId) {
        setManualEntryError('請至少輸入 CID 或交易序號。');
        return;
      }

      if (transactionId && !cid && !lookupPending) {
        setManualEntryError(lookupError || '無法從官方 nonce API 解析 CID，請確認交易序號。');
        return;
      }

      if (!holderValue) {
        setManualEntryError('請提供持卡者 DID。');
        return;
      }

      const normalizedStatus = normalizeCredentialStatus(resolvedStatus) || (lookupPending ? 'PENDING' : 'ISSUED');
      const statusDetails = describeCredentialStatus(normalizedStatus);
      const finalCollected =
        resolvedCollected || statusDetails.collected || Boolean(lookupResultData?.collected);
      const finalCollectedAt =
        resolvedCollectedAt || lookupResultData?.collectedAt || manualLookup.collectedAt || null;
      const finalRevokedAt =
        resolvedRevokedAt || lookupResultData?.revokedAt || manualLookup.revokedAt || null;

      const entry = appendIssueLogEntry({
        timestamp: now,
        holderDid: holderValue,
        issuerId: issuerId || '',
        transactionId,
        cid,
        credentialJti: resolvedCredentialJti,
        cardScope: manualEntry.scope,
        scope: manualEntry.scope,
        scopeLabel: PRIMARY_SCOPE_LABEL[manualEntry.scope] || manualEntry.scope,
        status: normalizedStatus,
        collected: finalCollected,
        collectedAt: finalCollectedAt,
        revokedAt: statusDetails.revoked ? finalRevokedAt || now : finalRevokedAt,
        hasCredential: Boolean(cid),
        cidLookupSource: lookupSource,
        cidLookupError: lookupError,
        cidLookupPending: lookupPending,
        cidLookupHint: lookupHint,
        cidSandboxPrefix: sandboxPrefix,
      });

      if (!entry) {
        setManualEntryError('無法建立發卡紀錄，請稍後再試。');
        return;
      }

      setManualEntryFeedback('已加入發卡紀錄，可在下方列表追蹤狀態或撤銷。');
      setManualEntry((prev) => ({
        holderDid: '',
        cid: '',
        credentialJti: '',
        transactionId: '',
        scope: prev.scope,
        status: '',
        collected: false,
      }));
      setManualLookup(INITIAL_MANUAL_LOOKUP_STATE);
    } finally {
      setManualEntryLoading(false);
    }
  };

  const performManualNonceLookup = async () => {
    const transactionId = manualEntry.transactionId.trim();
    if (!transactionId) {
      setManualLookup({
        ...INITIAL_MANUAL_LOOKUP_STATE,
        error: '請先輸入交易序號後再查詢官方 nonce API。',
      });
      setManualEntryError('請先輸入交易序號後再查詢官方 nonce API。');
      return;
    }

    setManualEntryError(null);
    setManualEntryFeedback(null);
    setManualLookup({
      ...INITIAL_MANUAL_LOOKUP_STATE,
      loading: true,
      transactionId,
    });

    const lookupResult = await lookupCredentialByTransaction(transactionId);
    if (lookupResult.ok) {
      setManualEntry((prev) => ({
        ...prev,
        cid: lookupResult.cid || prev.cid,
        credentialJti: lookupResult.credentialJti || prev.credentialJti,
        holderDid: prev.holderDid || lookupResult.holderDid || holderDid || '',
        status: normalizeCredentialStatus(lookupResult.status) || prev.status || '',
        collected: prev.collected || lookupResult.collected,
      }));
      setManualLookup({
        loading: false,
        transactionId,
        cid: lookupResult.cid || '',
        credentialJti: lookupResult.credentialJti || '',
        status: lookupResult.status || null,
        collected: lookupResult.collected || false,
        holderDid: lookupResult.holderDid || null,
        collectedAt: lookupResult.collectedAt || null,
        revokedAt: lookupResult.revokedAt || null,
        error: null,
        pending: false,
        hint: null,
      });
      setManualEntryFeedback('已透過官方 nonce API 取得 CID，請確認資訊後加入發卡紀錄。');
    } else if (lookupResult.pending) {
      setManualEntry((prev) => ({
        ...prev,
        status: normalizeCredentialStatus(lookupResult.status) || prev.status || 'PENDING',
      }));
      setManualLookup({
        loading: false,
        transactionId,
        cid: lookupResult.cid || '',
        credentialJti: lookupResult.credentialJti || '',
        status: lookupResult.status || 'PENDING',
        collected: false,
        holderDid: lookupResult.holderDid || null,
        collectedAt: null,
        revokedAt: null,
        error: null,
        pending: true,
        hint: lookupResult.lookupHint || '指定 VC 尚未建立或 QR Code 尚未被掃描。',
      });
      setManualEntryError(null);
      setManualEntryFeedback(
        lookupResult.lookupHint
          ? `官方回應：${lookupResult.lookupHint}，請稍後再查詢 CID。`
          : '官方回應顯示憑證尚未領取，請稍後再查詢 CID。',
      );
    } else {
      setManualLookup({
        ...INITIAL_MANUAL_LOOKUP_STATE,
        transactionId,
        collected: false,
        error: lookupResult.lookupError || '查詢官方 nonce API 失敗，請稍後再試。',
      });
      setManualEntryError(lookupResult.lookupError || '查詢官方 nonce API 失敗，請稍後再試。');
    }
  };

  const resetManualEntry = () => {
    setManualEntry((prev) => ({
      holderDid: '',
      cid: '',
      credentialJti: '',
      transactionId: '',
      scope: prev.scope,
      status: '',
      collected: false,
    }));
    setManualEntryError(null);
    setManualEntryFeedback(null);
    setManualLookup(INITIAL_MANUAL_LOOKUP_STATE);
  };

  const recordInventoryCredential = (credential) => {
    if (!credential) {
      return;
    }

    let cid =
      credential.credential_id ||
      credential.credentialId ||
      credential.cid ||
      credential.id ||
      '';
    let credentialJti =
      (credential.credential_jti ||
        credential.credentialJti ||
        credential.jti ||
        '') &&
      String(credential.credential_jti || credential.credentialJti || credential.jti || '').trim();

    if (!credentialJti) {
      const embeddedJwt =
        (credential.credential && typeof credential.credential === 'string'
          ? credential.credential
          : null) ||
        (typeof credential.jwt === 'string' ? credential.jwt : null) ||
        (typeof credential.credential_jwt === 'string' ? credential.credential_jwt : null);
      if (embeddedJwt) {
        const identifiers = extractCredentialIdentifiers(embeddedJwt);
        credentialJti = identifiers.jti;
        if (!cid && identifiers.cid) {
          cid = normalizeCid(identifiers.cid);
        }
      }
    }

    cid = normalizeCid(cid);
    if (credentialJti) {
      credentialJti = credentialJti.trim();
    }
    if (!cid && credentialJti) {
      cid = parseCidFromJti(credentialJti);
    }
    if (!cid) {
      setManualEntryError('此憑證未提供 CID，請手動輸入後再加入紀錄。');
      return;
    }

    setManualEntryError(null);
    setManualEntryFeedback(null);

    const normalizedStatus = (credential.status || '').toString().toUpperCase();
    const isRevoked = normalizedStatus.includes('REVOK');
    const isCollected = ['ACCEPTED', 'COLLECTED', 'ACTIVE', 'ISSUED'].includes(normalizedStatus);
    const now = new Date().toISOString();

    appendIssueLogEntry({
      timestamp:
        credential.issued_at ||
        credential.issuedAt ||
        credential.created_at ||
        credential.createdAt ||
        now,
      holderDid: credential.holder_did || holderInventoryDid || holderDid || '',
      issuerId: issuerId || '',
      transactionId:
        credential.transaction_id ||
        credential.transactionId ||
        credential.request_id ||
        credential.requestId ||
        '',
      cid,
      credentialJti,
      cardScope: credential.primary_scope || credential.scope || 'MEDICAL_RECORD',
      scope: credential.primary_scope || credential.scope || 'MEDICAL_RECORD',
      scopeLabel:
        PRIMARY_SCOPE_LABEL[credential.primary_scope] ||
        PRIMARY_SCOPE_LABEL[credential.scope] ||
        credential.primary_scope ||
        credential.scope ||
        'MEDICAL_RECORD',
      status: isRevoked ? 'REVOKED' : 'ISSUED',
      collected: !isRevoked && isCollected,
      collectedAt:
        !isRevoked && isCollected
          ? credential.updated_at ||
            credential.updatedAt ||
            credential.accepted_at ||
            credential.acceptedAt ||
            now
          : null,
      revokedAt:
        isRevoked
          ? credential.updated_at ||
            credential.updatedAt ||
            credential.revoked_at ||
            credential.revokedAt ||
            now
        : null,
      hasCredential: true,
      cidLookupSource: 'wallet',
      cidLookupError: null,
      cidSandboxPrefix: sandboxPrefix,
    });
    setManualEntryFeedback('已將皮夾清單中的憑證加入發卡紀錄。');
  };

  const loadHolderInventory = async (targetDid) => {
    const did = (targetDid || holderInventoryDid || '').trim();
    setHolderInventoryError(null);
    if (!did) {
      setHolderInventoryError('請輸入持卡者 DID。');
      return;
    }
    if (!holderAccessToken) {
      setHolderInventoryError('請提供皮夾或發行端 Access Token。');
      return;
    }

    setHolderInventoryLoading(true);
    try {
      const response = await client.listHolderCredentials(did, holderAccessToken);
      setHolderInventoryLoading(false);
      if (!response.ok) {
        setHolderInventory([]);
        setHolderInventoryFetchedAt(null);
        setHolderInventoryError(`(${response.status}) ${response.detail}`);
        return;
      }

      const data = response.data || {};
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.credentials)
        ? data.credentials
        : [];
      setHolderInventory(
        list.map((item) => ({
          ...item,
          credential_id: item.credential_id || item.credentialId || item.cid || '',
          status: item.status || item.state || '',
          primary_scope: item.primary_scope || item.scope || '',
        }))
      );
      setHolderInventoryFetchedAt(new Date().toISOString());
      setHolderInventoryActions({});
    } catch (err) {
      setHolderInventoryLoading(false);
      setHolderInventoryError(err.message || '載入皮夾資料失敗，請稍後再試。');
    }
  };

  const forgetHolderInventory = async () => {
    const did = (holderInventoryDid || '').trim();
    setForgetState({ loading: true, error: null, message: null });

    if (!did) {
      setForgetState({ loading: false, error: '請輸入持卡者 DID。', message: null });
      return;
    }

    if (!holderAccessToken) {
      setForgetState({
        loading: false,
        error: '請提供皮夾或發行端 Access Token。',
        message: null,
      });
      return;
    }

    const response = await client.forgetHolder(did, holderAccessToken);
    if (!response.ok) {
      setForgetState({ loading: false, error: `(${response.status}) ${response.detail}`, message: null });
      return;
    }

    setForgetState({ loading: false, error: null, message: '已向皮夾請求可遺忘權。' });
    setHolderInventory([]);
    setHolderInventoryFetchedAt(new Date().toISOString());
    setHolderInventoryActions({});
  };

  const revokeInventoryCredential = async (credential) => {
    const credentialJtiRaw =
      credential?.credential_jti || credential?.credentialJti || credential?.jti || '';
    let credentialJti = credentialJtiRaw ? String(credentialJtiRaw).trim() : '';
    let cid = credential?.credential_id || credential?.credentialId || credential?.cid;
    if (!cid && credentialJti) {
      cid = parseCidFromJti(credentialJti);
    }
    if (!cid && credential?.credential && typeof credential.credential === 'string') {
      const identifiers = extractCredentialIdentifiers(credential.credential);
      credentialJti = credentialJti || identifiers.jti;
      cid = identifiers.cid || cid;
    }

    cid = normalizeCid(cid);
    if (!cid) {
      return;
    }

    const key = `inventory-${cid}`;
    setHolderInventoryActions((prev) => ({
      ...prev,
      [key]: { loading: true, error: null, message: null },
    }));

    const response = await client.updateCredentialStatus(cid, 'revocation', issuerToken);

    if (!response.ok) {
      setHolderInventoryActions((prev) => ({
        ...prev,
        [key]: { loading: false, error: `(${response.status}) ${response.detail}`, message: null },
      }));
      return;
    }

    const now = new Date().toISOString();
    setHolderInventoryActions((prev) => ({
      ...prev,
      [key]: { loading: false, error: null, message: '已撤銷，列表將重新整理。' },
    }));

    appendIssueLogEntry({
      timestamp: now,
      holderDid: credential?.holder_did || holderInventoryDid || holderDid || '',
      issuerId: issuerId || '',
      transactionId:
        credential?.transaction_id ||
        credential?.transactionId ||
        credential?.request_id ||
        credential?.requestId ||
        '',
      cid,
      credentialJti: credentialJti || '',
      scope: credential?.primary_scope || credential?.scope || primaryScope,
      scopeLabel:
        PRIMARY_SCOPE_LABEL[credential?.primary_scope] ||
        PRIMARY_SCOPE_LABEL[credential?.scope] ||
        credential?.primary_scope ||
        credential?.scope ||
        primaryScope,
      status: 'REVOKED',
      collected: true,
      collectedAt:
        credential?.updated_at || credential?.updatedAt || credential?.accepted_at || credential?.acceptedAt || now,
      revokedAt: now,
      hasCredential: true,
      cidLookupSource: 'wallet',
      cidLookupError: null,
      cidSandboxPrefix: sandboxPrefix,
    });

    await loadHolderInventory(holderInventoryDid);
  };

  const runStatusAction = async (index, cid, action) => {
    if (!cid) {
      return;
    }

    const normalizedCid = normalizeCid(cid);
    const key = `${normalizedCid}-${action}`;
    setIssueLogActions((prev) => ({
      ...prev,
      [key]: { loading: true, message: null, error: null, tone: null },
    }));

    const response = await client.updateCredentialStatus(normalizedCid, action, issuerToken);

    if (!response.ok) {
      const rawDetail = response.detail;
      let detailMessage = '';
      if (typeof rawDetail === 'string') {
        detailMessage = rawDetail;
      } else if (rawDetail && typeof rawDetail === 'object') {
        detailMessage =
          rawDetail.message || rawDetail.detail || rawDetail.reason || JSON.stringify(rawDetail);
      }
      const detailCode =
        (rawDetail && typeof rawDetail === 'object' && (rawDetail.code || rawDetail.errorCode)) ||
        (detailMessage.match(/6\d{4}/) ? detailMessage.match(/6\d{4}/)[0] : null);
      const isPending61010 = detailCode === '61010' || /61010/.test(detailMessage);

      if (isPending61010) {
        updateIssueLogEntry(index, (entry) => ({
          ...entry,
          cidLookupPending: true,
          cidLookupError: null,
          cidLookupHint:
            detailMessage || '官方回應 61010：指定 VC 尚未領取或 QR Code 尚未被掃描。',
        }));
      }

      setIssueLogActions((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: isPending61010 ? null : `(${response.status}) ${detailMessage || '操作失敗'}`,
          message: isPending61010
            ? detailMessage || '官方仍回應 61010，請確認卡片是否完成領取。'
            : null,
          tone: isPending61010 ? 'info' : 'error',
        },
      }));
      return;
    }

    setIssueLogActions((prev) => ({
      ...prev,
      [key]: {
        loading: false,
        error: null,
        message: '操作成功，狀態已更新。',
        tone: 'success',
      },
    }));

    if (action === 'revocation') {
      updateIssueLogEntry(index, (entry) => ({
        ...entry,
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
      }));
      refreshIssueLogEntry(index);
    }
  };

  const refreshIssueLogEntry = async (index) => {
    const entry = issueLog[index];
    if (!entry) {
      return;
    }

    const transactionId = entry.transactionId ? entry.transactionId.trim() : '';
    const fallbackKey = entry.cid ? `${entry.cid}-refresh` : `entry-${index}-refresh`;
    const key = transactionId ? `${transactionId}-refresh` : fallbackKey;

    if (!transactionId) {
      setIssueLogActions((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: '此紀錄未保存交易序號，請改用「查詢 CID」補登後再試。',
          message: null,
          tone: 'error',
        },
      }));
      return;
    }

    setIssueLogActions((prev) => ({
      ...prev,
      [key]: { loading: true, message: null, error: null, tone: null },
    }));

    const lookupResult = await lookupCredentialByTransaction(transactionId);

    if (!lookupResult.ok && !lookupResult.pending) {
      setIssueLogActions((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: lookupResult.lookupError || '查詢官方 nonce API 失敗，請稍後再試。',
          message: null,
          tone: 'error',
        },
      }));
      updateIssueLogEntry(index, (current) => ({
        ...current,
        cidLookupSource: lookupResult.lookupSource || 'nonce',
        cidLookupError: lookupResult.lookupError || current.cidLookupError,
        cidLookupPending: false,
        cidLookupHint: lookupResult.lookupHint || current.cidLookupHint,
      }));
      return;
    }

    updateIssueLogEntry(index, (current) => {
      const nextCid = lookupResult.cid ? normalizeCid(lookupResult.cid) : current.cid;
      const nextJti = lookupResult.credentialJti || current.credentialJti || '';
      const nextStatus = lookupResult.status || current.status;
      const statusInfo = describeCredentialStatus(nextStatus);
      const nextCollectedAt =
        lookupResult.collectedAt ||
        current.collectedAt ||
        (statusInfo.collected && !current.collectedAt ? new Date().toISOString() : null);
      const nextRevokedAt =
        lookupResult.revokedAt ||
        current.revokedAt ||
        (statusInfo.revoked && !current.revokedAt ? new Date().toISOString() : null);
      const nextHolder = lookupResult.holderDid || current.holderDid || '';
      const hasCredential = current.hasCredential || Boolean(nextCid) || lookupResult.hasCredential;

      if (lookupResult.pending) {
        return {
          ...current,
          cid: nextCid,
          credentialJti: nextJti,
          status: nextStatus,
          holderDid: nextHolder,
          cidLookupSource: lookupResult.lookupSource || 'nonce',
          cidLookupError: null,
          cidLookupPending: true,
          cidLookupHint: lookupResult.lookupHint || current.cidLookupHint,
          hasCredential,
        };
      }

      return {
        ...current,
        cid: nextCid,
        credentialJti: nextJti,
        status: nextStatus,
        collected: lookupResult.collected || current.collected || statusInfo.collected,
        collectedAt: nextCollectedAt,
        revokedAt: nextRevokedAt,
        holderDid: nextHolder,
        cidLookupSource: lookupResult.lookupSource || 'nonce',
        cidLookupError: null,
        cidLookupPending: false,
        cidLookupHint: null,
        hasCredential,
      };
    });

    setIssueLogActions((prev) => ({
      ...prev,
      [key]: {
        loading: false,
        error: null,
        message:
          lookupResult.pending
            ? lookupResult.lookupHint || '官方仍回應 61010，請稍後再試。'
            : '已同步官方狀態並更新統計頁。',
        tone: lookupResult.pending ? 'info' : 'success',
      },
    }));
  };

  function updateCondition(field, value) {
    setCondition((prev) => ({ ...prev, [field]: value }));
  }

  function updateMedication(field, value) {
    setMedication((prev) => ({ ...prev, [field]: value }));
  }

  function updateAllergy(field, value) {
    setAllergyInfo((prev) => ({ ...prev, [field]: value }));
  }

  function updateIdentity(field, value) {
    setIdentityInfo((prev) => ({ ...prev, [field]: value }));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const resolvedScope = resolveDisclosureScope(primaryScope);

    const govPayload = convertToGovFormat({
      payload: payloadTemplate,
      scope: primaryScope,
      medication:
        includeMedication || primaryScope === 'MEDICATION_PICKUP' ? medication : null,
      consentScope: consentScopeCode,
      consentPurpose,
      consentPath,
      consentExpiry,
      allergy: allergyInfo,
      identity: identityInfo,
      identifiers: currentIdentifiers,
    });

    const submissionPayload = govPayload;

    if (!govPayload.fields.length) {
      setLoading(false);
      setError('缺少必要欄位，請確認診斷／領藥或同意書欄位是否完整。');
      return;
    }

    try {
      const response = await client.issueWithData(submissionPayload, issuerToken);
      setLoading(false);

      if (!response.ok) {
        setError(`(${response.status}) ${response.detail}`);
        return;
      }

      const data = response.data || {};
      const credentialJwt =
        data.credential ||
        data.credentialJwt ||
        data.credential_jwt ||
        data.credentialToken ||
        data.jwt ||
        null;
      const directIdentifiers = extractCredentialIdentifiers(credentialJwt);
      const normalized = {
        transactionId:
          data.transactionId || data.verifier_transaction_id || data.transaction_id || '',
        qrCode:
          data.qrCode || data.qrcodeImage || data.qrcode_image || data.qr_payload || '',
        deepLink: data.deepLink || data.authUri || data.auth_uri || '',
        raw: data,
      };
      if (normalized.transactionId) {
        onLatestTransactionChange?.(normalized.transactionId);
      }
      let recordedEntry = null;
      if (credentialJwt || normalized.transactionId) {
        try {
          recordedEntry = await recordIssue({
            credentialJwt,
            transactionId: normalized.transactionId,
          });
        } catch (err) {
          console.warn('Unable to record issuance entry', err);
        }
      }

      const cidValue = normalizeCid(recordedEntry?.cid || directIdentifiers.cid || '');
      const jtiValue = recordedEntry?.credentialJti || directIdentifiers.jti || '';
      const prefixValue =
        recordedEntry?.cidSandboxPrefix && typeof recordedEntry.cidSandboxPrefix === 'string'
          ? recordedEntry.cidSandboxPrefix
          : sandboxPrefix;
      const revocationDetails = computeRevocationDetails({
        cid: cidValue,
        sandboxPrefix: prefixValue,
        baseUrl: sanitizedBaseUrl,
        storedPath: recordedEntry?.cidRevocationPath || '',
        storedUrl: recordedEntry?.cidRevocationUrl || '',
        storedDisplayPath: recordedEntry?.cidRevocationDisplayPath || '',
        storedDisplayUrl: recordedEntry?.cidRevocationDisplayUrl || '',
      });

      setSuccess({
        ...normalized,
        cid: cidValue,
        credentialJti: jtiValue,
        cidRevocationPath: revocationDetails.path,
        cidRevocationDisplayPath: revocationDetails.displayPath,
        cidRevocationUrl: revocationDetails.url,
        cidRevocationDisplayUrl: revocationDetails.displayUrl,
        cidLookupSource:
          recordedEntry?.cidLookupSource || (credentialJwt ? 'response' : null),
        cidLookupError: recordedEntry?.cidLookupError || null,
        cidLookupPending: recordedEntry?.cidLookupPending || false,
        cidLookupHint: recordedEntry?.cidLookupHint || null,
      });

      if (normalized.transactionId) {
        setManualEntry((prev) => {
          if (prev.transactionId === normalized.transactionId) {
            return prev;
          }
          if (prev.transactionId && prev.transactionId !== normalized.transactionId) {
            return prev;
          }
          return {
            ...prev,
            transactionId: normalized.transactionId,
          };
        });
        setManualLookup(INITIAL_MANUAL_LOOKUP_STATE);
        setManualEntryError(null);
        setManualEntryFeedback(null);
      }
    } catch (err) {
      setLoading(false);
      setError(err.message || '發卡失敗，請稍後再試');
    }
  }

  function loadSample() {
    setCondition(INITIAL_CONDITION);
    setMedication(INITIAL_MEDICATION);
    setIncludeMedication(true);
    setEncounterHash('urn:sha256:3a1f0c98c5d4a4efed2d4dfe58e8');
    setConsentExpiry(dayjs().add(90, 'day').format('YYYY-MM-DD'));
    setConsentScopeCode('MEDSSI01');
    setConsentPurpose('MEDDATARESEARCH');
    setConsentPath('IRB2025001');
    setMedicalFields(DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', '));
    setMedicationFields(DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', '));
    setConsentFields(DEFAULT_DISCLOSURES.CONSENT_CARD.join(', '));
    setAllergyInfo(INITIAL_ALLERGY);
    setIdentityInfo({
      ...INITIAL_IDENTITY,
      pidVer: '01',
      pidValidTo: dayjs().add(10, 'year').format('YYYY-MM-DD'),
    });
  }

  function applyBasicTemplate(templateKey) {
    const baseExpiry = dayjs().add(90, 'day').format('YYYY-MM-DD');
    setConsentExpiry(baseExpiry);
    setConsentScopeCode('MEDSSI01');
    setConsentPath('IRB2025001');

    if (templateKey === 'pickup') {
      setIncludeMedication(true);
      setConsentPurpose('MEDICATION_PICKUP');
      setMedicalFields(DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', '));
      setMedicationFields(DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', '));
      setConsentFields(DEFAULT_DISCLOSURES.CONSENT_CARD.join(', '));
      return;
    }

    if (templateKey === 'research') {
      setIncludeMedication(true);
      setConsentPurpose('MEDDATARESEARCH');
      setMedicalFields(DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', '));
      setMedicationFields(DEFAULT_DISCLOSURES.MEDICATION_PICKUP.join(', '));
      setConsentFields(DEFAULT_DISCLOSURES.CONSENT_CARD.join(', '));
      return;
    }

    if (templateKey === 'allergy') {
      setIncludeMedication(false);
      setConsentPurpose('MEDRECACCESS');
      setMedicalFields('');
      setMedicationFields('');
      setConsentFields(DEFAULT_DISCLOSURES.ALLERGY_CARD.join(', '));
      return;
    }

    if (templateKey === 'identity') {
      setIncludeMedication(false);
      setConsentPurpose('MEDRECACCESS');
      setMedicalFields('');
      setMedicationFields('');
      setConsentFields(DEFAULT_DISCLOSURES.IDENTITY_CARD.join(', '));
      return;
    }

    setIncludeMedication(false);
    setConsentPurpose('MEDRECACCESS');
    setMedicalFields(DEFAULT_DISCLOSURES.MEDICAL_RECORD.join(', '));
    setMedicationFields('');
    setConsentFields(DEFAULT_DISCLOSURES.CONSENT_CARD.join(', '));
  }

  function applyBasicScenario(templateKey) {
    if (basicScenario === templateKey && !isExpertMode) {
      const matched = BASIC_SCENARIOS.find((scenario) => scenario.key === templateKey);
      loadSample();
      if (matched) {
        setPrimaryScope(matched.scope);
      }
      applyBasicTemplate(templateKey);
      return;
    }
    setBasicScenario(templateKey);
  }

  const qrSource = success?.qrCode || success?.deepLink || '';
  const shouldRenderImage = success?.qrCode?.startsWith('data:image');
  const successCidSourceLabel = describeLookupSource(success?.cidLookupSource);
  const successCidPending = Boolean(success?.cidLookupPending);
  const successCidHint = success?.cidLookupHint || null;
  const manualStatusInfo = describeCredentialStatus(manualEntry.status);
  const manualStatusBadgeClass = manualStatusInfo.tone
    ? `status-badge ${manualStatusInfo.tone}`
    : 'status-badge';

  if (!isExpertMode) {
    const activeScenario = BASIC_SCENARIOS.find((item) => item.key === basicScenario) ||
      BASIC_SCENARIOS[0];

    return (
      <section aria-labelledby="issuer-heading">
        <h2 id="issuer-heading">Step 1 – 醫院發行端（基本模式）</h2>
        <p className="badge">API Base URL：{baseUrl}</p>
        <div className="alert info">
          使用預設 Access Token 與示範欄位，一鍵產生含資料 QR Code。欲查看完整欄位與發卡紀錄，請切換到專家模式。
        </div>

        <div className="basic-grid">
          <div className="card basic-card">
            <div className="basic-card__header">
              <h3>選擇情境</h3>
              <span className="pill-icon" aria-hidden="true">⚡️</span>
            </div>
            <p className="hint">點選情境會自動載入預設欄位與選擇性揭露設定。</p>
            <div className="scenario-pills" role="group" aria-label="發卡情境">
              {BASIC_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.key}
                  type="button"
                  className={`scenario-pill${basicScenario === scenario.key ? ' active' : ''}`}
                  onClick={() => applyBasicScenario(scenario.key)}
                >
                  <span className="scenario-pill__label">{scenario.label}</span>
                  <span className="scenario-pill__desc">{scenario.description}</span>
                </button>
              ))}
            </div>
            <p className="helper">目前使用預設欄位與 Token，如需客製卡片或多憑證組合，請切換到專家模式。</p>
          </div>

          <div className="card basic-card">
            <div className="basic-card__header">
              <h3>快速發卡</h3>
              <span className="pill-icon" aria-hidden="true">💳</span>
            </div>
            <p className="hint">使用 {activeScenario.label} 模式，立即帶入示例欄位並產生 QR Code。</p>
            <div className="token-chip" aria-label="預設 Access Token">
              Access Token：<code>{issuerToken}</code>
            </div>
            <div className="quick-select basic-quick-select">
              <span className="quick-select-label">持卡者：</span>
              {HOLDER_PROFILES.map((profile) => (
                <button
                  key={profile.did}
                  type="button"
                  className={`secondary quick-select-button${
                    holderDid === profile.did ? ' active' : ''
                  }`}
                  onClick={() => {
                    setHolderDid(profile.did);
                    setHolderHint(profile.hint);
                    setCondition((prev) => ({ ...prev, subject: profile.did }));
                  }}
                >
                  {profile.label}
                </button>
              ))}
            </div>
            <div className="stack">
              <button type="button" className="secondary" onClick={() => applyBasicScenario(basicScenario)}>
                重新套用預設資料
              </button>
              <button type="button" onClick={submit} disabled={loading}>
                {loading ? '發卡中…' : '產生發卡 QR Code'}
              </button>
            </div>
            {error ? <div className="alert error">{error}</div> : null}
          </div>

          <div className="card basic-card">
            <div className="basic-card__header">
              <h3>掃描領卡</h3>
              <span className="pill-icon" aria-hidden="true">📱</span>
            </div>
            {success ? (
              <>
                <p className="hint">交易序號：{success.transactionId || '未知'}</p>
                {qrSource ? (
                  shouldRenderImage ? (
                    <div className="qr-container" aria-label="發卡 QR Code">
                      <img src={success.qrCode} alt="發卡 QR Code" width={192} height={192} />
                    </div>
                  ) : (
                    <div className="qr-container" aria-label="發卡 QR Code">
                      <QRCodeCanvas value={qrSource} size={192} includeMargin />
                    </div>
                  )
                ) : null}
                {success.deepLink ? (
                  <p>
                    Deep Link：<a href={success.deepLink}>{success.deepLink}</a>
                  </p>
                ) : null}
                <p className="helper">請以皮夾 App 掃描，完成授權後再到驗證頁查詢結果。</p>
              </>
            ) : (
              <div className="placeholder">尚未建立 QR Code，請點擊「產生發卡 QR Code」。</div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="issuer-heading">
      <h2 id="issuer-heading">Step 1 – 醫院發行端</h2>
      <p className="badge">API Base URL：{baseUrl}</p>
      <div className="alert info">
        根據醫療法與個資法規範，請先驗證身分再簽發病歷／領藥卡。QR Code 僅有效 5 分鐘，
        逾期會自動失效並需重新發行。
      </div>
      {!isExpertMode ? (
        <>
          <div className="alert muted">
            目前為基本模式，僅顯示必要欄位。若需查看沙盒調校細節（持卡清單、發卡紀錄、API 原始回應），
            請切換到專家模式。
          </div>
          <div className="basic-disclosure-guide">
            <div>
              <p className="hint">選擇性揭露快速示範：按一下情境即自動帶入欄位。</p>
              <div className="pill-row">
                <button type="button" className="pill" onClick={() => applyBasicTemplate('record')}>
                  🩺 門診授權
                </button>
                <button type="button" className="pill" onClick={() => applyBasicTemplate('pickup')}>
                  💊 領藥取藥
                </button>
                <button type="button" className="pill" onClick={() => applyBasicTemplate('research')}>
                  📊 研究揭露
                </button>
                <button type="button" className="pill" onClick={() => applyBasicTemplate('allergy')}>
                  ⚠️ 過敏資訊
                </button>
                <button type="button" className="pill" onClick={() => applyBasicTemplate('identity')}>
                  🪪 匿名身分
                </button>
              </div>
              <p className="hint">
                每個情境僅送出必要欄位，其他醫療欄位會以選擇性揭露方式保留，方便基本模式快速體驗。
              </p>
            </div>
            <div aria-hidden="true" className="basic-disclosure-guide__icon">🧬</div>
          </div>
        </>
      ) : null}

      <div className="grid two">
        <div className="card">
          <label htmlFor="issuer-token">發行端 Access Token</label>
          <input id="issuer-token" type="text" value={issuerToken} readOnly aria-readonly="true" />
          <small className="helper">
            測試環境預設為 koreic2ZEFZ2J4oo2RaZu58yGVXiqDQy，正式系統請以 Vault 或 HSM 安全保存。
          </small>

          <label htmlFor="issuer-id">發行者 DID</label>
          <input
            id="issuer-id"
            value={issuerId}
            onChange={(event) => setIssuerId(event.target.value)}
          />

          <label htmlFor="holder-did">預期持卡者 DID</label>
          <input
            id="holder-did"
            value={holderDid}
            onChange={(event) => {
              const value = event.target.value;
              setHolderDid(value);
              setCondition((prev) => ({ ...prev, subject: value }));
            }}
          />

          <label htmlFor="holder-hint">皮夾顯示提示</label>
          <input
            id="holder-hint"
            value={holderHint}
            onChange={(event) => setHolderHint(event.target.value)}
          />
          <div className="quick-select">
            <span className="quick-select-label">常用持卡者：</span>
            {HOLDER_PROFILES.map((profile) => (
              <button
                key={profile.did}
                type="button"
                className={`secondary quick-select-button${
                  holderDid === profile.did ? ' active' : ''
                }`}
                onClick={() => {
                  setHolderDid(profile.did);
                  setHolderHint(profile.hint);
                  setCondition((prev) => ({ ...prev, subject: profile.did }));
                }}
              >
                {profile.label}
              </button>
            ))}
          </div>

          <label htmlFor="primary-scope">憑證主用途</label>
          <select
            id="primary-scope"
            value={primaryScope}
            onChange={(event) => setPrimaryScope(event.target.value)}
          >
            {PRIMARY_SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label htmlFor="ial">身份保證等級</label>
          <select id="ial" value={ial} onChange={(event) => setIal(event.target.value)}>
            <option value="MYDATA_LIGHT">MYDATA_LIGHT – 行動化驗證</option>
            <option value="NHI_CARD_PIN">NHI_CARD_PIN – 健保卡 + PIN</option>
            <option value="MOICA_CERT">MOICA_CERT – 自然人憑證</option>
          </select>

          <label htmlFor="valid">QR 有效分鐘 (1-5)</label>
          <input
            id="valid"
            type="number"
            min="1"
            max="5"
            value={validMinutes}
            onChange={(event) => setValidMinutes(event.target.value)}
          />

          <div className="alert warning">
            MODA 沙盒僅支援「含資料」發卡流程，空白樣板目前無法在官方系統測試。
          </div>

          <button type="button" onClick={submit} disabled={loading}>
            {loading ? '發卡中…' : '建立含資料 QR Code'}
          </button>
          <button type="button" className="secondary" onClick={loadSample} disabled={loading}>
            載入示例資料
          </button>

          {error ? <div className="alert error">{error}</div> : null}
          {success ? (
            <div className="alert success" role="status">
              <p>已取得政府沙盒 QR Code（交易序號：{success.transactionId || '未知'}）。</p>
              <div className="cid-summary" role="group" aria-label="憑證識別資訊">
                <div className="cid-summary-row">
                  <span className="cid-summary-label">憑證 CID</span>
                  {success.cid ? (
                    <code className="cid-summary-value">{success.cid}</code>
                  ) : (
                    <span className="cid-summary-placeholder">
                      尚未取得，請稍候於下方發卡紀錄確認。
                    </span>
                  )}
                </div>
                {success.credentialJti ? (
                  <div className="cid-summary-row">
                    <span className="cid-summary-label">JTI</span>
                    <code className="cid-summary-value">{success.credentialJti}</code>
                  </div>
                ) : null}
                {success.cidRevocationDisplayPath && success.cid ? (
                  <div className="cid-summary-row">
                    <span className="cid-summary-label">撤銷 API</span>
                    <code className="cid-summary-value">PUT {success.cidRevocationDisplayPath}</code>
                  </div>
                ) : null}
                {success.cidRevocationPath &&
                success.cid &&
                success.cidRevocationPath !== success.cidRevocationDisplayPath ? (
                  <div className="cid-summary-row">
                    <span className="cid-summary-label">沙盒路徑</span>
                    <code className="cid-summary-value">PUT {success.cidRevocationPath}</code>
                  </div>
                ) : null}
                {success.cidRevocationDisplayUrl && success.cid ? (
                  <div className="cid-summary-row">
                    <span className="cid-summary-label">完整 URL</span>
                    <code className="cid-summary-value">{success.cidRevocationDisplayUrl}</code>
                  </div>
                ) : null}
                {success.cidRevocationUrl &&
                success.cid &&
                success.cidRevocationUrl !== success.cidRevocationDisplayUrl ? (
                  <div className="cid-summary-row">
                    <span className="cid-summary-label">沙盒 URL</span>
                    <code className="cid-summary-value">{success.cidRevocationUrl}</code>
                  </div>
                ) : null}
              </div>
          {successCidPending ? (
            <p className="hint">
              {successCidHint || '官方回應顯示憑證尚未領取，請稍後再查詢 CID。'}
            </p>
          ) : success.cidLookupError ? (
            <p className="hint error">CID 查詢失敗：{success.cidLookupError}</p>
          ) : successCidSourceLabel ? (
            <p className="hint">CID 來源：{successCidSourceLabel}</p>
          ) : null}
            </div>
          ) : null}
        </div>

        <div className="card">
          <fieldset>
            <legend>FHIR Condition 摘要</legend>
            <label htmlFor="condition-code">ICD-10 Code</label>
            <input
              id="condition-code"
              value={condition.code}
              onChange={(event) => updateCondition('code', event.target.value)}
            />
            <label htmlFor="condition-display">診斷說明</label>
            <input
              id="condition-display"
              value={condition.display}
              onChange={(event) => updateCondition('display', event.target.value)}
            />
            <label htmlFor="condition-date">紀錄日期</label>
            <input
              id="condition-date"
              type="date"
              value={condition.recordedDate}
              onChange={(event) => updateCondition('recordedDate', event.target.value)}
            />
            <label htmlFor="encounter-id">就醫紀錄 ID</label>
            <input
              id="encounter-id"
              value={condition.encounter}
              onChange={(event) => updateCondition('encounter', event.target.value)}
            />
            <label htmlFor="subject-did">病患 DID</label>
            <input
              id="subject-did"
              value={condition.subject}
              onChange={(event) => updateCondition('subject', event.target.value)}
            />
            <label htmlFor="org-id">院所代碼</label>
            <input
              id="org-id"
              value={condition.managingOrg}
              onChange={(event) => updateCondition('managingOrg', event.target.value)}
            />
            <label htmlFor="hash">病歷摘要雜湊</label>
            <input
              id="hash"
              value={encounterHash}
              onChange={(event) => setEncounterHash(event.target.value)}
            />
            {primaryScope === 'CONSENT_CARD' && (
              <>
                <label htmlFor="consent-expire">授權到期日（可空白）</label>
                <input
                  id="consent-expire"
                  type="date"
                  value={consentExpiry}
                  onChange={(event) => setConsentExpiry(event.target.value)}
                />
                <label htmlFor="consent-scope">授權範圍代碼（cons_scope）</label>
                <input
                  id="consent-scope"
                  value={consentScopeCode}
                  onChange={(event) => setConsentScopeCode(event.target.value)}
                />
                <label htmlFor="consent-purpose">授權目的（cons_purpose）</label>
                <input
                  id="consent-purpose"
                  value={consentPurpose}
                  onChange={(event) => setConsentPurpose(event.target.value)}
                />
                <label htmlFor="consent-path">授權資料路徑（cons_path，可空白）</label>
                <input
                  id="consent-path"
                  value={consentPath}
                  onChange={(event) => setConsentPath(event.target.value)}
                />
              </>
            )}
            <div className="grid four">
              <div>
                <label htmlFor="gov-vc-uid">政府 vcUid</label>
                <input
                  id="gov-vc-uid"
                  value={currentIdentifiers?.vcUid || ''}
                  onChange={(event) => updateIdentifier('vcUid', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="gov-vc-id">vcId（卡片序號）</label>
                <input
                  id="gov-vc-id"
                  value={currentIdentifiers?.vcId || ''}
                  onChange={(event) => updateIdentifier('vcId', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="gov-vc-cid">vcCid（樣板代號）</label>
                <input
                  id="gov-vc-cid"
                  value={currentIdentifiers?.vcCid || ''}
                  onChange={(event) => updateIdentifier('vcCid', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="gov-api-key">API Key（可選）</label>
                <input
                  id="gov-api-key"
                  value={currentIdentifiers?.apiKey || ''}
                  onChange={(event) => updateIdentifier('apiKey', event.target.value)}
                />
              </div>
            </div>
            <p className="hint">
              ※ 請填入發行端沙盒後台顯示的卡片序號與樣板代號。值會暫存於瀏覽器 localStorage，便於多次測試。
            </p>
      </fieldset>

          <fieldset>
            <legend>
              領藥摘要
              <span className="helper" style={{ display: 'block' }}>
                {primaryScope === 'MEDICATION_PICKUP'
                  ? '此類卡片預設保留 3 天後自動刪除。'
                  : '可選擇是否附上領藥資訊。'}
              </span>
            </legend>
            <label htmlFor="include-med">
              <input
                id="include-med"
                type="checkbox"
                checked={includeMedication || primaryScope === 'MEDICATION_PICKUP'}
                onChange={(event) => setIncludeMedication(event.target.checked)}
                disabled={primaryScope === 'MEDICATION_PICKUP'}
              />
              加入領藥資訊
            </label>
            <label htmlFor="med-code">ATC Code</label>
            <input
              id="med-code"
              value={medication.code}
              onChange={(event) => updateMedication('code', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="med-display">藥品名稱</label>
            <input
              id="med-display"
              value={medication.display}
              onChange={(event) => updateMedication('display', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="quantity-text">包裝數量（僅限數字／中文）</label>
            <input
              id="quantity-text"
              value={medication.quantityText}
              onChange={(event) => updateMedication('quantityText', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="does-text">用藥指示</label>
            <input
              id="does-text"
              value={medication.doesText || ''}
              onChange={(event) => updateMedication('doesText', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="days-supply">用藥天數</label>
            <input
              id="days-supply"
              type="number"
              value={medication.daysSupply}
              onChange={(event) => updateMedication('daysSupply', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
            <label htmlFor="pickup-end">取藥期限</label>
            <input
              id="pickup-end"
              type="date"
              value={medication.pickupWindowEnd}
              onChange={(event) => updateMedication('pickupWindowEnd', event.target.value)}
              disabled={!includeMedication && primaryScope !== 'MEDICATION_PICKUP'}
            />
          </fieldset>

          {(primaryScope === 'ALLERGY_CARD' || primaryScope === 'MEDICATION_PICKUP') && (
            <fieldset>
              <legend>過敏資訊（vc_algy）</legend>
              <label htmlFor="allergy-code">過敏代碼（algy_code）</label>
              <input
                id="allergy-code"
                value={allergyInfo.code}
                onChange={(event) => updateAllergy('code', event.target.value)}
              />
              <label htmlFor="allergy-name">過敏名稱（algy_name）</label>
              <input
                id="allergy-name"
                value={allergyInfo.display}
                onChange={(event) => updateAllergy('display', event.target.value)}
              />
              <label htmlFor="allergy-severity">嚴重程度（algy_severity）</label>
              <input
                id="allergy-severity"
                value={allergyInfo.severity}
                onChange={(event) => updateAllergy('severity', event.target.value)}
              />
            </fieldset>
          )}

          {primaryScope === 'IDENTITY_CARD' && (
            <fieldset>
              <legend>匿名身分資訊（vc_pid）</legend>
              <label htmlFor="pid-hash">識別碼雜湊（pid_hash，8 位數字）</label>
              <input
                id="pid-hash"
                value={identityInfo.pidHash}
                onChange={(event) => updateIdentity('pidHash', event.target.value)}
              />
              <label htmlFor="pid-type">識別碼類型（pid_type）</label>
              <input
                id="pid-type"
                value={identityInfo.pidType}
                onChange={(event) => updateIdentity('pidType', event.target.value)}
              />
              <label htmlFor="pid-ver">識別碼版本（pid_ver）</label>
              <input
                id="pid-ver"
                value={identityInfo.pidVer}
                onChange={(event) => updateIdentity('pidVer', event.target.value)}
              />
              <label htmlFor="pid-issuer">發行者代碼（pid_issuer）</label>
              <input
                id="pid-issuer"
                value={identityInfo.pidIssuer}
                onChange={(event) => updateIdentity('pidIssuer', event.target.value)}
              />
              <label htmlFor="pid-valid">有效期限（pid_valid_to）</label>
              <input
                id="pid-valid"
                type="date"
                value={identityInfo.pidValidTo}
                onChange={(event) => updateIdentity('pidValidTo', event.target.value)}
              />
              <label htmlFor="wallet-id">皮夾識別碼（wallet_id）</label>
              <input
                id="wallet-id"
                value={identityInfo.walletId}
                onChange={(event) => updateIdentity('walletId', event.target.value)}
              />
            </fieldset>
          )}

          <fieldset>
            <legend>選擇性揭露欄位</legend>
            <label htmlFor="medical-fields">跨院病歷欄位 (MEDICAL_RECORD)</label>
            <textarea
              id="medical-fields"
              value={medicalFields}
              onChange={(event) => setMedicalFields(event.target.value)}
            />
            <label htmlFor="medication-fields">領藥欄位 (MEDICATION_PICKUP)</label>
            <textarea
              id="medication-fields"
              value={medicationFields}
              onChange={(event) => setMedicationFields(event.target.value)}
            />
            <label htmlFor="consent-fields">同意卡欄位 (CONSENT_CARD)</label>
            <textarea
              id="consent-fields"
              value={consentFields}
              onChange={(event) => setConsentFields(event.target.value)}
            />
            <label htmlFor="identity-fields">身分卡欄位 (IDENTITY_CARD)</label>
            <textarea
              id="identity-fields"
              value={DEFAULT_DISCLOSURES.IDENTITY_CARD.join(', ')}
              readOnly
              aria-readonly="true"
            />
          </fieldset>
        </div>
      </div>

      {success ? (
        <div className="card" aria-live="polite">
          <h3>政府沙盒回應</h3>
          <p>Transaction ID：{success.transactionId || '尚未提供'}</p>
          <p>
            憑證 CID：
            {success.cid ? success.cid : '尚未取得，請稍候於發卡紀錄確認。'}
          </p>
          {successCidPending ? (
            <p className="hint">
              {successCidHint || '官方回應顯示憑證尚未領取，請稍後再查詢 CID。'}
            </p>
          ) : success.cidLookupError ? (
            <p className="hint error">CID 查詢失敗：{success.cidLookupError}</p>
          ) : successCidSourceLabel ? (
            <p className="hint">CID 來源：{successCidSourceLabel}</p>
          ) : null}
          {qrSource ? (
            shouldRenderImage ? (
              <div className="qr-container" aria-label="發卡 QR Code">
                <img src={success.qrCode} alt="發卡 QR Code" width={192} height={192} />
              </div>
            ) : (
              <div className="qr-container" aria-label="發卡 QR Code">
                <QRCodeCanvas value={qrSource} size={192} includeMargin />
              </div>
            )
          ) : (
            <p>尚未取得 QR Code 圖片，請稍後重試。</p>
          )}
          {success.deepLink ? (
            <p>
              Deep Link：
              <a href={success.deepLink}>{success.deepLink}</a>
            </p>
          ) : null}
          {isExpertMode ? <pre>{JSON.stringify(success.raw, null, 2)}</pre> : null}
        </div>
      ) : null}

      {isExpertMode ? (
        <>
        <div className="card inventory-card" aria-live="polite">
        <div className="issue-log-header">
          <h3>持卡者憑證狀態</h3>
          {holderInventoryFetchedAt ? (
            <span className="badge">
              更新於 {new Date(holderInventoryFetchedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
        <p>
          直接透過皮夾 API 查詢指定 DID 目前持有的電子卡，並可一鍵補登到發卡紀錄或由發行端觸發撤銷／可遺忘權。
          若政府沙盒尚未回應，可先按「刷新持卡紀錄」同步最新清單。
        </p>
        <label htmlFor="inventory-holder-did">持卡者 DID</label>
        <input
          id="inventory-holder-did"
          value={holderInventoryDid}
          onChange={(event) => setHolderInventoryDid(event.target.value)}
          placeholder={holderDid}
        />
        <div className="quick-select">
          <span className="quick-select-label">快速帶入：</span>
          {HOLDER_PROFILES.map((profile) => (
            <button
              key={`inventory-${profile.did}`}
              type="button"
              className={`secondary quick-select-button${
                holderInventoryDid === profile.did ? ' active' : ''
              }`}
              onClick={() => setHolderInventoryDid(profile.did)}
            >
              {profile.label}
            </button>
          ))}
        </div>
        <div className="inventory-actions-row">
          <button type="button" onClick={() => loadHolderInventory()} disabled={holderInventoryLoading}>
            {holderInventoryLoading ? '同步中…' : '刷新持卡紀錄'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={forgetHolderInventory}
            disabled={forgetState.loading}
          >
            {forgetState.loading ? '執行中…' : '行使可遺忘權'}
          </button>
        </div>
        {holderInventoryError ? <div className="alert error">{holderInventoryError}</div> : null}
        {forgetState.error ? <div className="alert error">{forgetState.error}</div> : null}
        {forgetState.message ? <div className="alert success">{forgetState.message}</div> : null}
        {holderInventoryLoading ? (
          <p>皮夾資料載入中…</p>
        ) : holderInventory.length ? (
          <ul className="inventory-list">
            {holderInventory.map((credential, index) => {
              const hasRealCid = Boolean(
                credential.credential_id || credential.credentialId || credential.cid
              );
              const cid = hasRealCid
                ? credential.credential_id || credential.credentialId || credential.cid
                : `unknown-${index}`;
              const scopeLabel = credential.primary_scope
                ? PRIMARY_SCOPE_LABEL[credential.primary_scope] || credential.primary_scope
                : credential.scope
                ? PRIMARY_SCOPE_LABEL[credential.scope] || credential.scope
                : '未提供用途';
              const statusText = credential.status || credential.state || '未知狀態';
              const issuedAt =
                credential.issued_at ||
                credential.issuedAt ||
                credential.created_at ||
                credential.createdAt ||
                null;
              const updatedAt = credential.updated_at || credential.updatedAt || null;
              const actionKey = `inventory-${hasRealCid ? cid : index}`;
              const actionState = holderInventoryActions[actionKey];
              const revokeDisabled = !hasRealCid || Boolean(actionState?.loading);
              return (
                <li key={actionKey}>
                  <div className="issue-log-row">
                    <strong>{cid || '未提供 CID'}</strong>
                    <span className="meta">狀態：{statusText}</span>
                  </div>
                  <div className="meta">用途：{scopeLabel}</div>
                  <div className="meta">
                    持卡者：{credential.holder_did || holderInventoryDid || '未提供'}
                  </div>
                  <div className="meta">交易序號：{credential.transaction_id || credential.transactionId || '未提供'}</div>
                  <div className="meta">
                    發卡時間：{issuedAt ? new Date(issuedAt).toLocaleString() : '未提供'}
                  </div>
                  {updatedAt ? (
                    <div className="meta">最後更新：{new Date(updatedAt).toLocaleString()}</div>
                  ) : null}
                  <div className="issue-log-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => recordInventoryCredential(credential)}
                    >
                      加入發卡紀錄
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => revokeInventoryCredential(credential)}
                      disabled={revokeDisabled}
                    >
                      {actionState?.loading ? '撤銷中…' : '撤銷此卡'}
                    </button>
                  </div>
                  {actionState?.error ? (
                    <div className="issue-log-feedback error">{actionState.error}</div>
                  ) : null}
                  {actionState?.message ? (
                    <div className="issue-log-feedback success">{actionState.message}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>尚未載入皮夾資料，請先刷新持卡紀錄。</p>
        )}
        </div>

        <div className="card issue-log-card" aria-live="polite">
        <div className="issue-log-header">
          <h3>發卡紀錄</h3>
          <span className="badge">已記錄 {issueLog.length} 張</span>
        </div>
        <div className="issue-log-summary">
          <span className="stat-pill">全部 {issueLogStats.total}</span>
          <span className="stat-pill">待領取 {Math.max(issueLogStats.pending, 0)}</span>
          <span className="stat-pill">已領取 {issueLogStats.collected}</span>
          <span className="stat-pill">已撤銷 {issueLogStats.revoked}</span>
        </div>
        <form className="issue-log-manual" onSubmit={handleManualEntrySubmit}>
          <h4>手動補登／外部查詢結果</h4>
          <div className="manual-entry-grid">
            <div className="manual-transaction-field">
              <label htmlFor="manual-transaction">交易序號</label>
              <div className="manual-transaction-input">
                <input
                  id="manual-transaction"
                  value={manualEntry.transactionId}
                  onChange={(event) => handleManualEntryChange('transactionId', event.target.value)}
                  placeholder="nonce 查詢時回傳的 transactionId"
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={performManualNonceLookup}
                  disabled={manualLookup.loading}
                >
                  {manualLookup.loading ? '查詢中…' : '查詢 CID'}
                </button>
              </div>
              <p className="field-hint">依官方流程：先查 nonce，再解析 jti 取得 CID。</p>
            </div>
            <div>
              <label htmlFor="manual-holder-did">持卡者 DID</label>
              <input
                id="manual-holder-did"
                value={manualEntry.holderDid}
                onChange={(event) => handleManualEntryChange('holderDid', event.target.value)}
                placeholder={holderDid}
              />
            </div>
            <div>
              <label htmlFor="manual-cid">憑證 CID</label>
              <input
                id="manual-cid"
                value={manualEntry.cid}
                onChange={(event) => handleManualEntryChange('cid', event.target.value)}
                placeholder="a16187e9-…"
                readOnly={Boolean(manualEntry.transactionId)}
              />
              {manualEntry.transactionId ? (
                <p className="field-hint">填入交易序號後，CID 將依查詢結果自動帶入。</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="manual-jti">Credential JTI（官方回應 URL）</label>
              <input
                id="manual-jti"
                value={manualEntry.credentialJti}
                onChange={(event) => handleManualEntryChange('credentialJti', event.target.value)}
                placeholder="https://.../api/credential/a16187e9-…"
                readOnly={Boolean(manualEntry.transactionId)}
              />
              {manualEntry.transactionId ? (
                <p className="field-hint">JTI 會跟隨 nonce 回應同步更新。</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="manual-scope">用途</label>
              <select
                id="manual-scope"
                value={manualEntry.scope}
                onChange={(event) => handleManualEntryChange('scope', event.target.value)}
              >
                {PRIMARY_SCOPE_OPTIONS.map((option) => (
                  <option key={`manual-scope-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="manual-status-preview">
              <label htmlFor="manual-status">官方狀態</label>
              <div id="manual-status" className="manual-status-value">
                <span className={manualStatusBadgeClass}>{manualStatusInfo.text}</span>
              </div>
              <p className="field-hint">狀態會依 nonce 查詢結果自動更新。</p>
            </div>
          </div>
          <div className="manual-lookup-instructions">
            <h5>官方取得 CID 流程</h5>
            <ol>
              <li>
                呼叫
                <code>
                  GET /api/credential/nonce/{'{'}transactionId{'}'}
                </code>
                ，取得政府回傳的 credential JWT。
              </li>
              <li>
                解碼 JWT，讀取 payload 內的 <code>jti</code> 欄位。
              </li>
              <li>
                從 <code>jti</code> 的 URL 中擷取 <code>/api/credential/</code> 後的字串作為
                <code>CID</code>。
              </li>
            </ol>
            <p>
              完成後即可呼叫
              <code>
                PUT /api/credential/{'{'}cid{'}'}/revocation
              </code>
              撤銷卡片。
            </p>
          </div>
          {manualLookup.transactionId ? (
            <div
              className={`manual-lookup-result${
                manualLookup.error ? ' error' : manualLookup.pending ? ' pending' : ''
              }`}
            >
              <div className="manual-lookup-row header">
                <strong>官方查詢結果</strong>
                <span>交易序號：{manualLookup.transactionId}</span>
              </div>
              {manualLookup.error ? (
                <p className="manual-lookup-error">{manualLookup.error}</p>
              ) : (
                <>
                  <div className="manual-lookup-row">
                    <span className="label">CID</span>
                    <span className="value code">{manualLookup.cid || manualEntry.cid || '尚未取得'}</span>
                  </div>
                  <div className="manual-lookup-row">
                    <span className="label">JTI</span>
                    <span className="value code">
                      {manualLookup.credentialJti || manualEntry.credentialJti || '尚未取得'}
                    </span>
                  </div>
                  {(() => {
                    const statusInfo = describeCredentialStatus(manualLookup.status);
                    const badgeClass = statusInfo.tone
                      ? `status-badge ${statusInfo.tone}`
                      : 'status-badge';
                    const collectedState = manualLookup.collected || statusInfo.collected;
                    return (
                      <>
                        <div className="manual-lookup-row">
                          <span className="label">官方狀態</span>
                          <span className="value">
                            <span className={badgeClass}>{statusInfo.text}</span>
                          </span>
                        </div>
                        <div className="manual-lookup-row">
                          <span className="label">是否領取</span>
                          <span className="value">
                            {collectedState ? '已領取（官方資料）' : '尚未領取'}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                  {manualLookup.pending && manualLookup.hint ? (
                    <div className="manual-lookup-row">
                      <span className="label">官方回應</span>
                      <span className="value">{manualLookup.hint}</span>
                    </div>
                  ) : null}
                  {manualLookup.cid ? (
                    <div className="manual-lookup-row">
                      <span className="label">撤銷路徑</span>
                      <span className="value code">
                        PUT /api/credential/{manualLookup.cid}/revocation
                      </span>
                    </div>
                  ) : null}
                  {manualLookup.holderDid ? (
                    <div className="manual-lookup-row">
                      <span className="label">持卡者 DID</span>
                      <span className="value code">{manualLookup.holderDid}</span>
                    </div>
                  ) : null}
                  {manualLookup.collectedAt ? (
                    <div className="manual-lookup-row">
                      <span className="label">領取時間</span>
                      <span className="value">
                        {new Date(manualLookup.collectedAt).toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                  {manualLookup.revokedAt ? (
                    <div className="manual-lookup-row">
                      <span className="label">撤銷時間</span>
                      <span className="value">
                        {new Date(manualLookup.revokedAt).toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                  <p className="manual-lookup-note">請以官方查詢結果為準，確認無誤後再寫入紀錄。</p>
                </>
              )}
            </div>
          ) : null}
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={manualEntry.collected}
              onChange={(event) => handleManualEntryChange('collected', event.target.checked)}
            />
            標示為已領取（會記錄領取時間）
          </label>
          <div className="manual-entry-actions">
            <button type="submit" disabled={manualEntryLoading}>
              {manualEntryLoading ? '查詢中…' : '加入發卡紀錄'}
            </button>
            <button type="button" className="secondary" onClick={resetManualEntry}>
              清除輸入
            </button>
          </div>
          {manualEntryError ? <div className="alert error">{manualEntryError}</div> : null}
          {manualEntryFeedback ? <div className="alert success">{manualEntryFeedback}</div> : null}
        </form>
        {issueLog.length === 0 ? (
          <p>
            尚未紀錄任何電子卡。政府沙盒回應 200 時，系統會解析 credential JWT 的 jti 欄位並自動寫入 CID
            與交易序號，方便稽核。可在此標示是否完成取卡並依需求觸發 PUT /api/credential/{'{cid}'}/revocation。
          </p>
        ) : (
          <ul className="issue-log">
            {issueLog.map((entry, index) => {
              const key = `${entry.transactionId || entry.cid || entry.timestamp}-${index}`;
              const timestamp = entry.timestamp
                ? new Date(entry.timestamp).toLocaleString()
                : '時間未知';
              const cidLabel = entry.cid
                ? entry.cid
                : entry.cidLookupPending
                ? '等待領取'
                : entry.cidLookupError
                ? '查詢失敗'
                : entry.cidLookupSource === 'transaction'
                ? '待官方查詢'
                : entry.hasCredential
                ? '解析失敗'
                : '官方回應未提供 credential';
              const statusInfo = describeCredentialStatus(entry.status);
              const statusBadgeClass = statusInfo.tone
                ? `status-badge ${statusInfo.tone}`
                : 'status-badge';
              const statusLabelExtra =
                statusInfo.revoked && entry.revokedAt
                  ? `（${new Date(entry.revokedAt).toLocaleString()}）`
                  : '';
              const entryCollected = entry.collected || statusInfo.collected;
              const collectedLabel = entryCollected
                ? entry.collectedAt
                  ? `已領取（${new Date(entry.collectedAt).toLocaleString()}）`
                  : '已領取（狀態同步）'
                : '尚未領取';
              const lookupSourceLabel = describeLookupSource(entry.cidLookupSource);
              const displayCid = entry.cid || '';
              const displayRevocationPath =
                displayCid &&
                (entry.cidRevocationDisplayPath || entry.cidRevocationPath)
                  ? entry.cidRevocationDisplayPath || entry.cidRevocationPath
                  : '';
              const sandboxRevocationPath =
                displayCid &&
                entry.cidRevocationPath &&
                entry.cidRevocationPath !== displayRevocationPath
                  ? entry.cidRevocationPath
                  : '';
              const displayRevocationUrl =
                displayCid && (entry.cidRevocationDisplayUrl || entry.cidRevocationUrl)
                  ? entry.cidRevocationDisplayUrl || entry.cidRevocationUrl
                  : '';
              const sandboxRevocationUrl =
                displayCid &&
                entry.cidRevocationUrl &&
                entry.cidRevocationUrl !== displayRevocationUrl
                  ? entry.cidRevocationUrl
                  : '';
              const displayJti = entry.credentialJti || '';
              const actionKey = entry.cid ? `${entry.cid}-revocation` : null;
              const actionState = actionKey ? issueLogActions[actionKey] : null;
              const revokeDisabled =
                !entry.cid || entry.status === 'REVOKED' || Boolean(actionState?.loading);
              const refreshKey = entry.transactionId
                ? `${entry.transactionId}-refresh`
                : entry.cid
                ? `${entry.cid}-refresh`
                : null;
              const refreshState = refreshKey ? issueLogActions[refreshKey] : null;
              const refreshDisabled = Boolean(refreshState?.loading);
              return (
                <li key={key}>
                  <div className="issue-log-row">
                    <strong>{entry.holderDid || '未知持卡者'}</strong>
                    <span className="meta">{timestamp}</span>
                  </div>
                  <div className="meta">用途：{entry.scopeLabel}</div>
                  <div
                    className="cid-summary cid-summary-inline"
                    role="group"
                    aria-label="CID 與撤銷資訊"
                  >
                    <div className="cid-summary-row">
                      <span className="cid-summary-label">憑證 CID</span>
                      {displayCid ? (
                        <code className="cid-summary-value">{displayCid}</code>
                      ) : (
                        <span
                          className={`cid-summary-placeholder${
                            entry.cidLookupError ? ' error' : ''
                          }${entry.cidLookupPending ? ' pending' : ''}`}
                        >
                          {cidLabel}
                        </span>
                      )}
                    </div>
                    {displayJti ? (
                      <div className="cid-summary-row">
                        <span className="cid-summary-label">JTI</span>
                        <code className="cid-summary-value">{displayJti}</code>
                      </div>
                    ) : null}
                    {displayRevocationPath ? (
                      <div className="cid-summary-row">
                        <span className="cid-summary-label">撤銷 API</span>
                        <code className="cid-summary-value">PUT {displayRevocationPath}</code>
                      </div>
                    ) : null}
                    {sandboxRevocationPath ? (
                      <div className="cid-summary-row">
                        <span className="cid-summary-label">沙盒路徑</span>
                        <code className="cid-summary-value">PUT {sandboxRevocationPath}</code>
                      </div>
                    ) : null}
                    {displayRevocationUrl ? (
                      <div className="cid-summary-row">
                        <span className="cid-summary-label">完整 URL</span>
                        <code className="cid-summary-value">{displayRevocationUrl}</code>
                      </div>
                    ) : null}
                    {sandboxRevocationUrl ? (
                      <div className="cid-summary-row">
                        <span className="cid-summary-label">沙盒 URL</span>
                        <code className="cid-summary-value">{sandboxRevocationUrl}</code>
                      </div>
                    ) : null}
                    {lookupSourceLabel ? (
                      <p className="hint cid-summary-hint">CID 來源：{lookupSourceLabel}</p>
                    ) : null}
                    {entry.cidLookupHint && !entry.cidLookupError ? (
                      <p className="hint cid-summary-hint">官方回應：{entry.cidLookupHint}</p>
                    ) : null}
                  </div>
                  <div className="meta">交易序號：{entry.transactionId || '未提供'}</div>
                  <div className="meta">發行者：{entry.issuerId || '未設定'}</div>
                  <div className="meta">
                    狀態：<span className={statusBadgeClass}>{statusInfo.text}</span>
                    {statusLabelExtra ? <span className="meta-note">{statusLabelExtra}</span> : null}
                  </div>
                  <div className="meta">領取紀錄：{collectedLabel}</div>
                  {entry.cidLookupError ? (
                    <div className="issue-log-feedback error">
                      CID 查詢失敗：{entry.cidLookupError}
                    </div>
                  ) : entry.cidLookupPending ? (
                    <div className="issue-log-feedback info">
                      官方查詢回應：{entry.cidLookupHint || '憑證尚未領取，請稍後再查詢。'}
                    </div>
                  ) : null}
                  <div className="issue-log-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => refreshIssueLogEntry(index)}
                      disabled={refreshDisabled}
                    >
                      {refreshState?.loading ? '查詢中…' : '重新查詢官方狀態'}
                    </button>
                    <button type="button" className="secondary" onClick={() => toggleCollected(index)}>
                      {entry.collected ? '標示為未領取' : '標示為已領取'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => runStatusAction(index, entry.cid, 'revocation')}
                      disabled={revokeDisabled}
                    >
                      {actionState?.loading ? '撤銷中…' : '撤銷此憑證'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => removeIssueLogEntry(index)}
                    >
                      從紀錄中移除
                    </button>
                  </div>
                  {actionState?.error ? (
                    <div className="issue-log-feedback error">{actionState.error}</div>
                  ) : null}
                  {actionState?.message ? (
                    <div
                      className={`issue-log-feedback ${
                        actionState.tone === 'info'
                          ? 'info'
                          : actionState.tone === 'error'
                          ? 'error'
                          : 'success'
                      }`}
                    >
                      {actionState.message}
                    </div>
                  ) : null}
                  {refreshState?.error ? (
                    <div className="issue-log-feedback error">{refreshState.error}</div>
                  ) : null}
                  {refreshState?.message ? (
                    <div
                      className={`issue-log-feedback ${
                        refreshState.tone === 'info'
                          ? 'info'
                          : refreshState.tone === 'error'
                          ? 'error'
                          : 'success'
                      }`}
                    >
                      {refreshState.message}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">
          ※ 「撤銷此憑證」將使用 PUT /api/credential/&lt;cid&gt;/revocation，請確認操作為不可逆並於執行前再次核對。
        </p>
        <button
          type="button"
          className="secondary"
          onClick={clearIssueLog}
          disabled={!issueLog.length}
        >
          清除發卡紀錄
        </button>
        </div>
        </>
      ) : null}
    </section>
  );
}
