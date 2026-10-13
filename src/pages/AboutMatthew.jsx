import { matthewEnquiryHref } from '../lib/matthewEnquiry'
import { Link } from 'react-router-dom'

// Profile copy and email are supplied only after source/model verification.
export default function AboutMatthew({ profile }) {
  const enquiry = matthewEnquiryHref(profile.email)
  return (
    <div className="page">
      <div className="status-bar">
        <Link to="/premium" className="btn-ghost">Back</Link>
        <Link to="/" style={{ color: 'inherit', padding: '12px 0' }} aria-label="Home">Regulated</Link>
      </div>
      <main className="page-content-wide" aria-labelledby="about-matthew-title"
        style={{ paddingTop: 8, paddingBottom: 24, overflowWrap: 'anywhere' }}>
        <h1 id="about-matthew-title" style={{ margin: '0 0 16px', font: '300 32px/38px var(--font-display)' }}>About Matthew</h1>
        {profile.paragraphs.length === 0 && <p style={{ color: 'var(--ink-muted)' }}>{profile.role}</p>}
        {profile.paragraphs.map((text, index) => <p key={index} style={{ marginBottom: 16 }}>{text}</p>)}
        <section className="card" aria-labelledby="matthew-programmes-title" style={{ padding: 20, margin: '24px 0' }}>
          <h2 id="matthew-programmes-title" style={{ marginTop: 0, font: '400 24px/30px var(--font-display)' }}>One-to-one programmes</h2>
          <p>{profile.programmes}</p>
          {enquiry && <a className="btn-primary btn-lg" href={enquiry}
            style={{ height: 'auto', minHeight: 52, padding: '12px 16px', textAlign: 'center', textDecoration: 'none' }}>Email Matthew about working together</a>}
          {enquiry && <p style={{ marginBottom: 0 }}><a href={`mailto:${profile.email}`} style={{ color: 'var(--ink)' }}>{profile.email}</a></p>}
        </section>
        <section aria-labelledby="matthew-qualifications-title">
          <h2 id="matthew-qualifications-title" style={{ font: '400 24px/30px var(--font-display)' }}>Qualifications and training</h2>
          <ul style={{ paddingLeft: 24 }}>{profile.qualifications.map(item => <li key={item} style={{ marginBottom: 10 }}>{item}</li>)}</ul>
          <p>{profile.membership}</p>
          <p>{profile.currentStudy}</p>
          <a href="https://www.matthewtweediehypnosis.com.au/about/" style={{ color: 'var(--ink)' }}>Matthew’s full practitioner profile</a>
        </section>
      </main>
    </div>
  )
}
