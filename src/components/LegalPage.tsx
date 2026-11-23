export const company = () => ({
  name: process.env.COMPANY_NAME || 'Vitalora Healthcare',
  email: process.env.SUPPORT_EMAIL || 'support@vitalora.app',
  grievance: process.env.GRIEVANCE_OFFICER_NAME || 'Grievance Officer, Vitalora Healthcare',
  grievanceEmail: process.env.GRIEVANCE_OFFICER_EMAIL || process.env.SUPPORT_EMAIL || 'support@vitalora.app',
  address: process.env.COMPANY_ADDRESS || 'Noida, Uttar Pradesh, India',
  updated: '23 November 2026',
});

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px', color: '#172B4D', lineHeight: 1.65, fontSize: 16 }}>
      <a href="/app/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#102A43', fontWeight: 700 }}>
        <img src="/icon-192.png" alt="" width={40} height={40} /> Vitalora Healthcare
      </a>
      <h1 style={{ fontSize: 34, lineHeight: 1.1, margin: '28px 0 6px' }}>{title}</h1>
      <p style={{ color: '#5B6D83', marginTop: 0 }}>Last updated {company().updated}</p>
      {children}
    </main>
  );
}
