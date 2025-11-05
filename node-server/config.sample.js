module.exports = {
  // Issuer sandbox credentials -------------------------------------------
  vcId: '00000000_vc_cond', // 胃炎病歷卡樣板序號
  vcCid: '646005', // 對應後台樣板代號
  vcUid: '00000000_vc_cond',
  apiKey: 'YOUR_ISSUER_API_KEY',

  // Verifier sandbox credentials ----------------------------------------
  verifier_ref: '27950876_vp_swaggerui_test_2',
  verifier_accessToken: 'YOUR_VERIFIER_ACCESS_TOKEN',

  // 預設欄位值：依官方樣板建議，可依實際資料覆寫
  cards: {
    vc_pid: {
      pid_hash: 'hash::8f4c0d1d6c1a4b67a4f9d1234567890b',
      pid_name: '張小華',
      pid_birth: '1950-07-18'
    },
    vc_cons: {
      cons_scope: 'research_info',
      cons_purpose: 'AI 胃炎趨勢研究',
      cons_issuer: 'MOHW-IRB-2025-001',
      cons_path: 'medssi://consent/irb-2025-001'
    },
    vc_cond: {
      cond_code: 'K29.70',
      cond_display: '慢性胃炎（未特指）',
      cond_onset: '2025-02-12'
    },
    vc_algy: {
      algy_code: 'Z88.1',
      algy_name: 'Penicillin allergy',
      algy_severity: 'high'
    },
    vc_rx: {
      med_code: 'A02BC05',
      med_name: 'Omeprazole 20mg capsule',
      qty_value: '30',
      qty_unit: 'capsules'
    }
  }
};
