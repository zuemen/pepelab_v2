import { useCallback } from 'react';
import dayjs from 'dayjs';

export function buildSamplePayload({
  holderDid = 'did:example:patient-001',
  conditionCode = 'K29.7',
  managingOrg = 'org:tph-001',
}) {
  return {
    fhir_profile: 'https://profiles.iisigroup.com.tw/StructureDefinition/medssi-bundle',
    condition: {
      resourceType: 'Condition',
      id: `cond-${holderDid.split(':').pop()}`,
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10',
            code: conditionCode,
            display: 'Gastritis, unspecified',
          },
        ],
        text: 'Gastritis, unspecified',
      },
      recordedDate: dayjs().format('YYYY-MM-DD'),
      encounter: {
        system: 'urn:medssi:encounter-id',
        value: `enc-${holderDid.split(':').pop()}`,
      },
      subject: {
        system: 'did:example',
        value: holderDid,
      },
    },
    encounter_summary_hash: 'urn:sha256:3a1f0c98c5d4a4efed2d4dfe58e8',
    managing_organization: {
      system: 'urn:medssi:org',
      value: managingOrg,
    },
    issued_on: dayjs('2025-11-08').format('YYYY-MM-DD'),
    consent_expires_on: dayjs().add(60, 'day').format('YYYY-MM-DD'),
    medication_dispense: [
      {
        resourceType: 'MedicationDispense',
        id: `med-${holderDid.split(':').pop()}`,
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.whocc.no/atc',
              code: 'MNT001',
              display: 'Serenitol',
            },
          ],
          text: 'Serenitol',
        },
        quantity_text: 'Bottle',
        does_text: '每日晚餐飯後50MG',
        days_supply: 3,
        performer: {
          system: 'did:example',
          value: 'did:example:rx-unit-01',
        },
        pickup_window_end: dayjs('2025-12-31').format('YYYY-MM-DD'),
      },
    ],
  };
}

export function useSamplePayload(holderDid) {
  return useCallback(() => buildSamplePayload({ holderDid }), [holderDid]);
}
