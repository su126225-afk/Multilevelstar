/* Sends a student's mock-test answers to the teacher's database (Supabase) so the teacher can download them as a Word file.
   Used by cdi-listening-1.html, cdi-reading-1.html, cdi-writing-1.html and ielts-mock.html (classic script, no imports needed). */
(function () {
  var QK = 'ielts_mock_queue', AK = 'ielts_mock_attempt';
  var cfgP = null;
  function cfg() {
    if (!cfgP) cfgP = import('./config.js').then(function (m) { return m.CONFIG; }).catch(function () { return {}; });
    return cfgP;
  }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  var TN = parseInt((location.pathname.match(/-(\d+)\.html/) || [0, 1])[1], 10) || 1;
  var M = window.MockSync = {
    testNo: TN,
    key: function () { return TN === 1 ? 'ielts_mock_v1' : 'ielts_mock_v1_t' + TN; },
    student: function () { var s = jget('ma_student', null); return s && s.name ? s : null; },
    attempt: function () { var a = localStorage.getItem(AK); if (!a) { a = rid(); localStorage.setItem(AK, a); } return a; },
    newAttempt: function () { var a = rid(); localStorage.setItem(AK, a); return a; },
    post: function (row) {
      return cfg().then(function (c) {
        if (!c.supabaseUrl || !c.supabaseAnonKey) return false;
        return fetch(c.supabaseUrl + '/rest/v1/mock_submissions', {
          method: 'POST',
          headers: { apikey: c.supabaseAnonKey, Authorization: 'Bearer ' + c.supabaseAnonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(row)
        }).then(function (r) { return r.ok || r.status === 409; }).catch(function () { return false; });
      });
    },
    // section: 'listening' | 'reading' | 'writing'; data: {correct,total,band,details,text1,text2}
    send: function (section, data) {
      var s = M.student() || { name: 'Unknown student', group: '-' };
      var row = { attempt_id: M.attempt(), student_name: String(s.name).slice(0, 120), group_code: String(s.group || '-').slice(0, 40), section: section };
      if (TN > 1) row.test_no = TN;
      for (var k in data) row[k] = data[k];
      return M.post(row).then(function (ok) {
        if (!ok) { var q = jget(QK, []); q.push(row); jset(QK, q); }
        return ok;
      });
    },
    flush: function () {
      var q = jget(QK, []); if (!q.length) return Promise.resolve();
      jset(QK, []);
      return Promise.all(q.map(function (r) { return M.post(r).then(function (ok) { if (!ok) { var n = jget(QK, []); n.push(r); jset(QK, n); } }); }));
    }
  };
  M.flush();
})();
