import { Link } from 'react-router-dom'

// Renders approved legal text that lives in this repository (src/content), never user or remote content.
export default function LegalDocument({ html, back = '/' }) {
  return (
    <div className="page-plain">
      <main className="page-content-wide legal-document" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <p><Link to={back}>Back</Link></p>
      </main>
    </div>
  )
}
