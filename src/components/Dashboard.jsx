import { useMemo, useRef, useState } from 'react';
import { PIPELINES } from '../data/pipelines';
import { ProductNav } from './AuthGate';

const gmailSamples = [
  { id: 'g1', from: 'USCIS Updates', subject: 'Biometrics appointment reminder', body: 'USCIS reminder: Your biometrics appointment is scheduled for August 12, 2026. Bring your appointment notice and photo identification. Missing the appointment may delay your case.' },
  { id: 'g2', from: 'Financial Aid Office', subject: 'Scholarship documents due soon', body: 'Your scholarship file is missing income verification. Upload the required documents by September 1, 2026 or your award may be delayed.' },
  { id: 'g3', from: 'Hospital Discharge Team', subject: 'Follow-up care instructions', body: 'Please schedule a follow-up appointment within 7 days. Call the nurse line if breathing symptoms get worse or medication doses are missed.' },
];

export default function Dashboard({ account, onAnalyze, onBack, onLogout, initialError }) {
  const [selectedPipeline, setSelectedPipeline] = useState('common');
  const [inputMode, setInputMode] = useState('paste');
  const [text, setText] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(gmailSamples[0].id);
  const [error, setError] = useState(initialError || '');
  const fileInput = useRef(null);

  const pipeline = useMemo(() => PIPELINES.find((item) => item.id === selectedPipeline) ?? PIPELINES.at(-1), [selectedPipeline]);
  const selectedGmail = gmailSamples.find((item) => item.id === selectedEmail) ?? gmailSamples[0];

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 900_000) {
      setError('That file is too large for the demo. Try a smaller text, .eml, or exported Gmail file.');
      return;
    }
    setText(await file.text());
    setInputMode('paste');
    setError('');
  }

  function submitText() {
    const trimmed = text.trim();
    if (trimmed.length < 30) {
      setError('Add more document text before analyzing.');
      return;
    }
    onAnalyze(trimmed, selectedPipeline, 'Uploaded document');
  }

  function submitGmail() {
    const emailText = `From: ${selectedGmail.from}\nSubject: ${selectedGmail.subject}\n\n${selectedGmail.body}`;
    onAnalyze(emailText, selectedPipeline, 'Gmail reader');
  }

  return (
    <div className="product-shell dashboard-shell">
      <ProductNav account={account} onBack={onBack} onLogout={onLogout} />
      <main className="dashboard-grid">
        <section className="pipeline-column">
          <div className="dashboard-heading">
            <span className="mono-kicker">Choose your crisis pipeline</span>
            <h1>Pick the specialist first. Use Common Bot when nothing fits.</h1>
          </div>
          <div className="pipeline-list">
            {PIPELINES.map((item) => (
              <button key={item.id} className={`pipeline-row ${item.id === selectedPipeline ? 'active' : ''}`} style={{ '--accent': item.accent }} onClick={() => setSelectedPipeline(item.id)}>
                <span className="pipeline-orb" />
                <span><strong>{item.label}</strong><small>{item.title}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <div className="selected-pipeline" style={{ '--accent': pipeline.accent }}>
            <span className="pipeline-orb" />
            <div>
              <span className="mono-kicker">{pipeline.label}</span>
              <h2>{pipeline.title}</h2>
              <p>{pipeline.description}</p>
              <div className="example-chips">{pipeline.examples.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          </div>

          <div className="input-tabs">
            <button className={inputMode === 'paste' ? 'active' : ''} onClick={() => setInputMode('paste')}>Upload or paste</button>
            <button className={inputMode === 'gmail' ? 'active' : ''} onClick={() => setInputMode('gmail')}>Gmail reader</button>
          </div>

          {inputMode === 'paste' ? (
            <section className="input-card">
              <div className="drop-line" onClick={() => fileInput.current?.click()}>
                <input ref={fileInput} type="file" accept=".txt,.eml,.md,text/plain,message/rfc822" onChange={(event) => handleFile(event.target.files?.[0])} />
                <strong>Upload .txt, .eml, or exported Gmail text</strong>
                <span>or paste directly below</span>
              </div>
              <textarea value={text} onChange={(event) => { setText(event.target.value); setError(''); }} placeholder="Paste the document, email, notice, contract, discharge instructions, or school letter here..." />
              <button className="primary-action" onClick={submitText}>Analyze with {pipeline.title}</button>
            </section>
          ) : (
            <section className="input-card gmail-card">
              <div className="gmail-connect">
                <div><strong>Gmail Reader</strong><p>For this zip-file demo, it analyzes sample crisis emails or uploaded Gmail exports. Real Gmail OAuth can connect here later from the signed-in account.</p></div>
                <button onClick={() => setGmailConnected(true)}>{gmailConnected ? 'Gmail linked' : 'Link Gmail demo'}</button>
              </div>
              <div className="gmail-list">
                {gmailSamples.map((email) => (
                  <button key={email.id} className={selectedEmail === email.id ? 'active' : ''} onClick={() => setSelectedEmail(email.id)}>
                    <strong>{email.subject}</strong><span>{email.from}</span>
                  </button>
                ))}
              </div>
              <div className="email-preview"><span>{selectedGmail.from}</span><strong>{selectedGmail.subject}</strong><p>{selectedGmail.body}</p></div>
              <button className="primary-action" onClick={submitGmail}>Analyze selected Gmail</button>
            </section>
          )}

          {error && <div className="inline-error">{error}</div>}
        </section>
      </main>
    </div>
  );
}
