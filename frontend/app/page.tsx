'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function WelcomePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState(false);

  function continueToInstructions() {
    const f = firstName.trim();
    const l = lastName.trim();
    if (!f || !l) {
      setError(true);
      return;
    }
    sessionStorage.setItem('candidateFirstName', f);
    sessionStorage.setItem('candidateLastName', l);
    router.push('/instructions');
  }

  return (
    <div className="center-screen">
      <div className="card fade-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pillar5-logo.png" alt="Pillar 5" className="brand-logo" />
        <div className="eyebrow">CLOUD COMPUTING · KNOWLEDGE CHECK</div>
        <h1 className="title">Before we begin</h1>
        <div className="subtitle">Tell us who&apos;s taking this assessment.</div>

        <div className="field">
          <label htmlFor="fname">First name</label>
          <input
            id="fname"
            className="text-input"
            type="text"
            autoComplete="given-name"
            placeholder="e.g. Thandiwe"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && continueToInstructions()}
          />
        </div>
        <div className="field">
          <label htmlFor="lname">Surname</label>
          <input
            id="lname"
            className="text-input"
            type="text"
            autoComplete="family-name"
            placeholder="e.g. Mahlangu"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && continueToInstructions()}
          />
          {error && <div className="error-text">Please enter both your first name and surname.</div>}
        </div>

        <button className="btn btn-primary btn-full" onClick={continueToInstructions}>
          Continue
        </button>
        <div className="admin-link-wrap">
          <button className="admin-link" onClick={() => router.push('/admin')}>
            Facilitator dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
